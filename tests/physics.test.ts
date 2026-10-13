import { describe, it, expect } from 'vitest';
import { stepBallPhysics, vecLength } from '../server/physics.js';
import { TABLE_DIMENSIONS, BALL_PHYSICS, PADDLE_PHYSICS } from '../shared/constants.js';
import type { BallState, PaddleState } from '../shared/types.js';

describe('VoxelPong Server Physics Engine', () => {
  it('correctly simulates gravity and downward trajectory', () => {
    const ball: BallState = {
      pos: { x: 0, y: 1.5, z: 0 },
      velocity: { x: 0, y: 0, z: 0 }
    };
    const paddle1: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.6 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };
    const paddle2: PaddleState = { ...paddle1, pos: { x: 0, y: 0.95, z: -1.6 } };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, paddle1, paddle2, dt, false, false);

    expect(ball.velocity.y).toBeLessThan(0);
    expect(ball.pos.y).toBeLessThan(1.5);
    expect(result.ballHitFloor).toBe(false);
  });

  it('bounces cleanly when contacting table surface', () => {
    const tableTop = TABLE_DIMENSIONS.height + BALL_PHYSICS.radius;
    const ball: BallState = {
      pos: { x: 0, y: tableTop + 0.01, z: 0.5 },
      velocity: { x: 0, y: -2.0, z: 0 }
    };
    const paddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.6 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, paddle, paddle, dt, false, false);

    expect(result.events.some((e) => e.type === 'TABLE_BOUNCE')).toBe(true);
    expect(ball.velocity.y).toBeGreaterThan(0); // Upward velocity after bounce
  });

  it('detects swept paddle collision and reflects velocity toward opponent', () => {
    // Ball moving fast towards P1 paddle at Z = 1.6
    const ball: BallState = {
      pos: { x: 0, y: 0.95, z: 1.55 },
      velocity: { x: 0, y: 0.5, z: 8.0 } // Moving +Z towards P1
    };
    const p1Paddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.60 },
      velocity: { x: 0, y: 0.5, z: -1.0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };
    const p2Paddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: -1.60 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, p1Paddle, p2Paddle, dt, true, false);

    expect(result.events.some((e) => e.type === 'PADDLE_HIT')).toBe(true);
    // After P1 hits, ball velocity in Z must be negative (moving toward opponent P2)
    expect(ball.velocity.z).toBeLessThan(0);
    // Speed should not exceed BALL_PHYSICS.maxSpeed
    expect(vecLength(ball.velocity)).toBeLessThanOrEqual(BALL_PHYSICS.maxSpeed + 0.01);
  });

  it('flags floor contact when ball drops below floor level', () => {
    const ball: BallState = {
      pos: { x: 0, y: 0.02, z: 2.0 }, // Past table edge near floor
      velocity: { x: 0, y: -2.0, z: 0 }
    };
    const paddle: PaddleState = {
      pos: { x: 0, y: 0.95, z: 1.6 },
      velocity: { x: 0, y: 0, z: 0 },
      pitch: 0,
      yaw: 0,
      roll: 0,
      isSmashing: false
    };

    const dt = 1 / 120;
    const result = stepBallPhysics(ball, paddle, paddle, dt, false, false);
    expect(result.ballHitFloor).toBe(true);
  });
});
