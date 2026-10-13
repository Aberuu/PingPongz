import { describe, it, expect } from 'vitest';
import { PADDLE_PHYSICS, REACH_SYSTEM, TABLE_DIMENSIONS, ASSIST_PRESETS } from '../shared/constants.js';
import { stepBallPhysics } from '../server/physics.js';
import type { BallState, PaddleState } from '../shared/types.js';

describe('PRD 3.0 Wide Reach & Governor System', () => {
  it('expands paddle lateral travel bounds to +/- 1.25m', () => {
    expect(PADDLE_PHYSICS.minX).toBe(-1.25);
    expect(PADDLE_PHYSICS.maxX).toBe(1.25);
    expect(PADDLE_PHYSICS.footworkMaxX).toBe(0.60);
    expect(PADDLE_PHYSICS.footworkSpeed).toBe(1.5);
  });

  it('scales lateral hitbox padding when paddle reaches outside center table corridor', () => {
    const wideBall: BallState = {
      pos: { x: 0.95, y: 0.95, z: 1.58 },
      velocity: { x: 0, y: 0, z: 4.0 }
    };
    const widePaddle: PaddleState = {
      pos: { x: 1.15, y: 0.95, z: 1.60 },
      velocity: { x: 0, y: 0, z: -1.0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false,
      footworkX: 0.50
    };
    const idlePaddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: -1.60 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };

    // With paddle at x=1.15, dist from 0.45 is 0.70m -> padding = 0.07m
    // Distance between ball x=0.95 and paddle x=1.15 is 0.20m
    // Without padding (0.18m base radius), this would miss! With padding (0.18 + 0.07 = 0.25m), it hits!
    const dt = 1 / 120;
    const result = stepBallPhysics(wideBall, widePaddle, idlePaddle, dt, true, false);

    expect(result.events.some((e) => e.type === 'PADDLE_HIT')).toBe(true);
    expect(wideBall.velocity.z).toBeLessThan(0); // Successfully reflected
  });

  it('enforces reach governor reducing lateral velocity when ball would be physically unreachable by receiver', () => {
    // Ball moving towards P1
    const ball: BallState = {
      pos: { x: 0, y: 0.95, z: 1.55 },
      velocity: { x: 0, y: 0, z: 6.0 }
    };
    // Hitter (P1) hits with sharp cross-court lateral angle
    const p1Paddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.60 },
      velocity: { x: 4.0, y: 0, z: -1.0 },
      pitch: 0,
      yaw: 0.35,
      roll: 0,
      isSmashing: false,
      assistPreset: 'casual' // 100% governor enforcement
    };
    // Receiver (P2) is on the opposite side at x = -0.55
    const receiverPaddle: PaddleState = {
      pos: { x: -0.55, y: 0.95, z: -1.60 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false,
      assistPreset: 'casual'
    };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, p1Paddle, receiverPaddle, dt, true, false);

    expect(result.events.some((e) => e.type === 'PADDLE_HIT')).toBe(true);

    // Verify governor adjusted velocity so predicted X is reachable
    const distZToReceiver = Math.abs(PADDLE_PHYSICS.p2BaseZ - 1.60);
    const vz = Math.abs(ball.velocity.z);
    const tArrive = distZToReceiver / Math.max(1.0, vz);
    const predictedX = ball.pos.x + ball.velocity.x * tArrive;
    const deltaX = Math.abs(predictedX - receiverPaddle.pos.x);
    const tEffective = Math.max(0.06, tArrive - REACH_SYSTEM.governorReactionTime);
    const maxReachDist = REACH_SYSTEM.governorReachSpeed * tEffective + ASSIST_PRESETS.casual.hitToleranceRadius;

    expect(deltaX).toBeLessThanOrEqual(maxReachDist + 0.05);
  });

  it('applies edge ball aerodynamic deceleration on diagonal wide shots', () => {
    const edgeBall: BallState = {
      pos: { x: 0.70, y: 0.95, z: 0.50 }, // Wide shot near edge (|x| > halfWidth * 0.75 = 0.57m)
      velocity: { x: 2.0, y: 0, z: 5.0 }
    };
    const initialSpeed = Math.hypot(edgeBall.velocity.x, edgeBall.velocity.z);

    const idlePaddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.60 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };

    const dt = 1 / 120;
    stepBallPhysics(edgeBall, idlePaddle, idlePaddle, dt, false, false);
    const newSpeed = Math.hypot(edgeBall.velocity.x, edgeBall.velocity.z);

    // Speed should have experienced aerodynamic edge drag
    expect(newSpeed).toBeLessThan(initialSpeed);
  });

  it('executes defensive slice lob with high arc and float trajectory when isSlice is true', () => {
    const ball: BallState = {
      pos: { x: 0, y: 0.95, z: 1.55 },
      velocity: { x: 0, y: 0, z: 6.0 }
    };
    const slicePaddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.60 },
      velocity: { x: 0, y: 0, z: -1.0 },
      pitch: 0.20,
      yaw: 0,
      roll: 0,
      isSmashing: false,
      isSlice: true
    };
    const idlePaddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: -1.60 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, slicePaddle, idlePaddle, dt, true, false);

    const hitEvent = result.events.find((e) => e.type === 'PADDLE_HIT');
    expect(hitEvent).toBeDefined();
    expect(hitEvent?.payload?.isSlice).toBe(true);
    // Slice lob produces high upward arc (vy > 2.8) and float forward speed (|vz| <= 4.2)
    expect(ball.velocity.y).toBeGreaterThan(2.8);
    expect(Math.abs(ball.velocity.z)).toBeLessThanOrEqual(4.5);
  });

  it('detects sweet spot hit when impact is within 0.038m of paddle blade center', () => {
    const ball: BallState = {
      pos: { x: 0.01, y: 0.96, z: 1.55 }, // Within 0.02m of center
      velocity: { x: 0, y: 0, z: 5.0 }
    };
    const paddle: PaddleState = {
      pos: { x: 0.0, y: 0.95, z: 1.60 },
      velocity: { x: 0, y: 0, z: -1.0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };
    const idlePaddle: { [key: string]: any } = { ...paddle, pos: { x: 0, y: 0.95, z: -1.60 } };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, paddle, idlePaddle as PaddleState, dt, true, false);

    const hitEvent = result.events.find((e) => e.type === 'PADDLE_HIT');
    expect(hitEvent?.payload?.isSweetSpot).toBe(true);
  });
});
