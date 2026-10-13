import {
  TABLE_DIMENSIONS,
  NET_DIMENSIONS,
  BALL_PHYSICS,
  PADDLE_PHYSICS,
  ASSIST_PRESETS,
  REACH_SYSTEM
} from '../shared/constants.js';
import type { Vec3, BallState, PaddleState, PlayerSlot, GameEventData } from '../shared/types.js';

export function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vecNormalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len < 0.000001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Compute normal vector of paddle given pitch, yaw, roll and player side
export function getPaddleNormal(paddle: PaddleState, slot: PlayerSlot): Vec3 {
  // Base normal: P1 faces -Z, P2 faces +Z
  const baseZ = slot === 'p1' ? -1 : 1;
  let nx = 0;
  let ny = 0;
  let nz = baseZ;

  // Apply pitch (tilting up should always tilt normal upward +Y)
  // For P1 (nz = -1): cosP*ny - sinP*nz = sinP (positive when pitch > 0)
  // For P2 (nz = +1): we invert pitch so tilting mouse up tilts normal upward (+Y)
  const pitchAngle = slot === 'p1' ? paddle.pitch : -paddle.pitch;
  const cosP = Math.cos(pitchAngle);
  const sinP = Math.sin(pitchAngle);
  const ny1 = ny * cosP - nz * sinP;
  const nz1 = ny * sinP + nz * cosP;
  ny = ny1;
  nz = nz1;

  // Apply yaw (aiming left/right relative to player's view)
  const yawAngle = slot === 'p1' ? paddle.yaw : -paddle.yaw;
  const cosY = Math.cos(yawAngle);
  const sinY = Math.sin(yawAngle);
  const nx2 = nx * cosY + nz * sinY;
  const nz2 = -nx * sinY + nz * cosY;
  nx = nx2;
  nz = nz2;

  return vecNormalize({ x: nx, y: ny, z: nz });
}

export interface PhysicsStepResult {
  events: GameEventData[];
  ballHitFloor: boolean;
  floorHitPos?: Vec3;
}

export function stepBallPhysics(
  ball: BallState,
  p1Paddle: PaddleState,
  p2Paddle: PaddleState,
  dt: number,
  canP1Hit: boolean,
  canP2Hit: boolean
): PhysicsStepResult {
  const events: GameEventData[] = [];
  let ballHitFloor = false;
  let floorHitPos: Vec3 | undefined;

  // 1. Integrate Gravity & Aerodynamic drag for wide balls
  ball.velocity.y -= BALL_PHYSICS.gravity * dt;
  if (Math.abs(ball.pos.x) > TABLE_DIMENSIONS.halfWidth * 0.75) {
    ball.velocity.x *= (1 - REACH_SYSTEM.edgeDragReduction * dt * 2.0);
  }

  // Calculate intended movement segment
  const oldPos: Vec3 = { ...ball.pos };
  let nextPos: Vec3 = {
    x: oldPos.x + ball.velocity.x * dt,
    y: oldPos.y + ball.velocity.y * dt,
    z: oldPos.z + ball.velocity.z * dt
  };

  // 2. Check Paddle Collisions with Swept Disc Test
  const paddles: Array<{ slot: PlayerSlot; paddle: PaddleState; canHit: boolean }> = [
    { slot: 'p1', paddle: p1Paddle, canHit: canP1Hit },
    { slot: 'p2', paddle: p2Paddle, canHit: canP2Hit }
  ];

  for (const { slot, paddle, canHit } of paddles) {
    if (!canHit) continue;

    const normal = getPaddleNormal(paddle, slot);
    const pCenter = paddle.pos;

    // Relative movement of ball towards paddle plane
    const dOld = vecDot({ x: oldPos.x - pCenter.x, y: oldPos.y - pCenter.y, z: oldPos.z - pCenter.z }, normal);
    const dNext = vecDot({ x: nextPos.x - pCenter.x, y: nextPos.y - pCenter.y, z: nextPos.z - pCenter.z }, normal);

    // Ball must cross paddle plane from the front face (dOld > 0 and dNext <= BALL_PHYSICS.radius)
    // or be currently overlapping within radius
    const isApproaching = vecDot(ball.velocity, normal) < 0;
    const isCrossing = (dOld >= 0 && dNext <= BALL_PHYSICS.radius) || (Math.abs(dNext) <= BALL_PHYSICS.radius + 0.05 && isApproaching);

    if (isCrossing && isApproaching) {
      // Find time of impact t in [0, 1]
      const denom = dOld - dNext;
      const t = denom !== 0 ? clamp(dOld / denom, 0, 1) : 0;
      const hitPoint = {
        x: oldPos.x + (nextPos.x - oldPos.x) * t,
        y: oldPos.y + (nextPos.y - oldPos.y) * t,
        z: oldPos.z + (nextPos.z - oldPos.z) * t
      };

      // Check distance from hitPoint to paddle center with assist tolerance + lateral padding
      const assist = ASSIST_PRESETS[paddle.assistPreset || 'normal'] || ASSIST_PRESETS.normal;
      const baseTolerance = assist.hitToleranceRadius;
      const lateralDistFromCenter = Math.abs(hitPoint.x);
      const lateralPadding = lateralDistFromCenter > REACH_SYSTEM.lateralPaddingStart
        ? (lateralDistFromCenter - REACH_SYSTEM.lateralPaddingStart) * REACH_SYSTEM.lateralPaddingFactor
        : 0;
      const hitTolerance = baseTolerance + lateralPadding;
      const distToCenter = Math.hypot(hitPoint.x - pCenter.x, hitPoint.y - pCenter.y, hitPoint.z - pCenter.z);
      if (distToCenter <= hitTolerance + BALL_PHYSICS.radius) {
        // Successful hit!
        const isSmash = !!paddle.isSmashing;
        const isSlice = !!paddle.isSlice;
        const isSweetSpot = distToCenter <= 0.038;
        let multiplier = isSmash ? BALL_PHYSICS.smashMultiplier : 1.0;
        if (isSweetSpot) multiplier *= 1.10;

        // Reflect velocity against paddle normal
        const dotVN = vecDot(ball.velocity, normal);
        let reflV = {
          x: (ball.velocity.x - 2 * dotVN * normal.x) * BALL_PHYSICS.paddleRestitution,
          y: (ball.velocity.y - 2 * dotVN * normal.y) * BALL_PHYSICS.paddleRestitution,
          z: (ball.velocity.z - 2 * dotVN * normal.z) * BALL_PHYSICS.paddleRestitution
        };

        // Add paddle velocity transfer with clamped values to avoid extreme spikes
        const clampedPaddleVx = clamp(paddle.velocity.x, -5.0, 5.0);
        const clampedPaddleVy = clamp(paddle.velocity.y, -2.5, 2.0);
        const clampedPaddleVz = clamp(paddle.velocity.z, -5.0, 5.0);

        reflV.x += clampedPaddleVx * BALL_PHYSICS.paddleTransferFactor;
        reflV.y += clampedPaddleVy * 0.35; // Controlled vertical boost
        reflV.z += clampedPaddleVz * BALL_PHYSICS.paddleTransferFactor;

        // Apply smash / sweetspot boost
        reflV.x *= multiplier;
        reflV.y *= multiplier;
        reflV.z *= multiplier;

        // Defensive slice / chop (right-click): float higher with reduced forward push
        if (isSlice) {
          reflV.y = Math.max(reflV.y + 1.1, 2.2);
          reflV.z *= 0.75;
          reflV.x *= 0.85;
        }

        // Inward steering on corner/side follow shots:
        // When ball is hit wide, steer return arc back into opponent table rather than flying straight off the side
        const wideDistX = Math.max(Math.abs(hitPoint.x), Math.abs(paddle.pos.x));
        if (wideDistX > 0.28) {
          const opponentTargetZ = slot === 'p1' ? -TABLE_DIMENSIONS.halfLength * 0.55 : TABLE_DIMENSIONS.halfLength * 0.55;
          const distZToOpponent = Math.max(0.6, Math.abs(opponentTargetZ - hitPoint.z));
          const forwardSpeedZ = Math.max(3.2, Math.abs(reflV.z));
          const tToOpponent = distZToOpponent / forwardSpeedZ;
          // Target landing X in the inner region of opponent court
          const targetInwardX = clamp(hitPoint.x * 0.12, -0.38, 0.38);
          const requiredInwardVx = (targetInwardX - hitPoint.x) / tToOpponent;
          const wideStrength = clamp((wideDistX - 0.28) / 0.45, 0, 1);
          const inwardFactor = 0.60 + 0.30 * wideStrength;
          reflV.x = reflV.x * (1 - inwardFactor) + requiredInwardVx * inwardFactor;
        } else if (assist.directionAssist > 0) {
          reflV.x = reflV.x * (1 - assist.directionAssist);
        }

        // Ensure proper target direction: P1 must hit towards -Z, P2 towards +Z
        const forwardSign = slot === 'p1' ? -1 : 1;
        const minForwardVz = wideDistX > 0.28 ? 4.2 : (isSlice ? 3.2 : 4.0);
        if (reflV.z * forwardSign < minForwardVz) {
          reflV.z = forwardSign * minForwardVz;
        }

        // 1. GUARANTEED NET CLEARANCE ARC: Prevent ball from clipping net, especially on side/wide shots
        const distToNet = Math.max(0.3, Math.abs(hitPoint.z));
        const forwardSpeed = Math.max(3.0, Math.abs(reflV.z));
        const tNet = distToNet / forwardSpeed;
        const gravDrop = 0.5 * BALL_PHYSICS.gravity * tNet * tNet;
        // Ample clearance margin above net (extra margin on wide shots where ball travels diagonally)
        const clearanceMargin = wideDistX > 0.28 ? 0.095 : 0.065;
        const targetClearanceY = NET_DIMENSIONS.topY + clearanceMargin;
        const minClearanceVy = (targetClearanceY - hitPoint.y + gravDrop) / tNet;

        if (reflV.y < minClearanceVy) {
          reflV.y = minClearanceVy;
        }

        // 2. FIX HIGH BALL / BAT ISSUE: Cap excessive loft while never overriding minClearanceVy
        if (!isSlice) {
          const maxVy = hitPoint.y >= 0.95 ? (isSmash ? 2.2 : 1.7) : (isSmash ? 2.8 : 2.3);
          const effectiveMaxVy = Math.max(minClearanceVy, maxVy);
          if (reflV.y > effectiveMaxVy) {
            reflV.y = effectiveMaxVy;
          }
        }

        // 3. REACH GOVERNOR: Ensure receiver can physically reach the return per PRD 3.0 formula
        const receiverPaddle = slot === 'p1' ? p2Paddle : p1Paddle;
        const receiverBaselineZ = slot === 'p1' ? PADDLE_PHYSICS.p2BaseZ : PADDLE_PHYSICS.p1BaseZ;
        const distZToReceiver = Math.abs(receiverBaselineZ - hitPoint.z);
        const vz = Math.abs(reflV.z);
        const tArrive = distZToReceiver / Math.max(1.0, vz);
        const tEffective = Math.max(0.06, tArrive - REACH_SYSTEM.governorReactionTime);
        const receiverAssist = ASSIST_PRESETS[receiverPaddle.assistPreset || 'normal'] || ASSIST_PRESETS.normal;
        const maxReachDist = REACH_SYSTEM.governorReachSpeed * tEffective + receiverAssist.hitToleranceRadius;
        const predictedBallX = hitPoint.x + reflV.x * tArrive;
        const receiverX = receiverPaddle.pos.x;
        const deltaX = Math.abs(predictedBallX - receiverX);
        const governorStrength = assist.governorStrength ?? 0.5;

        if (deltaX > maxReachDist && governorStrength > 0) {
          const excess = deltaX - maxReachDist;
          const pullDir = predictedBallX > receiverX ? -1 : 1;
          const targetPredictedX = predictedBallX + pullDir * (excess * governorStrength);
          reflV.x = (targetPredictedX - hitPoint.x) / tArrive;
        }

        // 4. BOLA LEBAR: Lateral speed dampening so wide shots stay on table without dropping into net
        if (Math.abs(reflV.x) > 1.4 || Math.abs(hitPoint.x) > 0.55) {
          reflV.x *= (1 - REACH_SYSTEM.edgeDragReduction);
        }

        // Clamp speed scaled by assist preset
        const maxSpeed = BALL_PHYSICS.maxSpeed * assist.maxSpeedScale;
        const speed = vecLength(reflV);
        if (speed > maxSpeed) {
          reflV = vecScale(vecNormalize(reflV), maxSpeed);
        }

        ball.velocity = reflV;
        // Place ball at hitPoint offset forward along normal
        nextPos = {
          x: hitPoint.x + normal.x * (BALL_PHYSICS.radius + 0.015),
          y: hitPoint.y + normal.y * (BALL_PHYSICS.radius + 0.015),
          z: hitPoint.z + normal.z * (BALL_PHYSICS.radius + 0.015)
        };

        events.push({
          type: 'PADDLE_HIT',
          payload: {
            player: slot,
            isSmash,
            isSlice,
            isSweetSpot,
            pos: hitPoint
          }
        });
        break; // Only one paddle hit per tick
      }
    }
  }

  // 3. Check Table Collision
  const tableY = TABLE_DIMENSIONS.height + BALL_PHYSICS.radius;
  if (oldPos.y >= tableY && nextPos.y <= tableY && ball.velocity.y < 0) {
    // Intersected table surface height
    const t = (oldPos.y - tableY) / (oldPos.y - nextPos.y);
    const hitX = oldPos.x + (nextPos.x - oldPos.x) * t;
    const hitZ = oldPos.z + (nextPos.z - oldPos.z) * t;

    // Check if within table bounds
    const withinWidth = Math.abs(hitX) <= TABLE_DIMENSIONS.halfWidth;
    const withinLength = Math.abs(hitZ) <= TABLE_DIMENSIONS.halfLength;

    if (withinWidth && withinLength) {
      // Clean bounce
      nextPos.y = tableY;
      ball.velocity.y = -ball.velocity.y * BALL_PHYSICS.tableRestitution;
      ball.velocity.x *= 0.98;
      ball.velocity.z *= 0.98;

      // Bola lebar lebih lambat: Bola yang mendarat dekat sisi meja kehilangan sedikit kecepatan (sekitar 10%)
      if (Math.abs(hitX) > TABLE_DIMENSIONS.halfWidth * 0.75) {
        ball.velocity.x *= (1 - REACH_SYSTEM.edgeDragReduction);
        ball.velocity.z *= (1 - REACH_SYSTEM.edgeDragReduction);
      }

      const side: PlayerSlot = hitZ > 0 ? 'p1' : 'p2';
      events.push({
        type: 'TABLE_BOUNCE',
        payload: {
          player: side,
          pos: { x: hitX, y: tableY, z: hitZ }
        }
      });
    }
  }

  // 4. Check Net Collision (Z = 0)
  const crossedZ = (oldPos.z <= 0 && nextPos.z >= 0) || (oldPos.z >= 0 && nextPos.z <= 0);
  if (crossedZ) {
    const tNet = oldPos.z / (oldPos.z - nextPos.z);
    const hitNetY = oldPos.y + (nextPos.y - oldPos.y) * tNet;
    const hitNetX = oldPos.x + (nextPos.x - oldPos.x) * tNet;

    if (
      hitNetY >= TABLE_DIMENSIONS.height &&
      hitNetY <= NET_DIMENSIONS.topY + BALL_PHYSICS.radius &&
      Math.abs(hitNetX) <= NET_DIMENSIONS.width / 2
    ) {
      // Rebound off net tape
      ball.velocity.z = -ball.velocity.z * 0.35;
      ball.velocity.y *= 0.6;
      nextPos.z = oldPos.z <= 0 ? -0.02 : 0.02;

      events.push({
        type: 'NET_HIT',
        payload: {
          pos: { x: hitNetX, y: hitNetY, z: 0 }
        }
      });
    }
  }

  // 5. Check Floor Collision (Out of bounds)
  const floorY = BALL_PHYSICS.radius;
  if (nextPos.y <= floorY) {
    nextPos.y = floorY;
    ball.velocity = { x: 0, y: 0, z: 0 };
    ballHitFloor = true;
    floorHitPos = { ...nextPos };
  }

  // Update ball position
  ball.pos = nextPos;

  return {
    events,
    ballHitFloor,
    floorHitPos
  };
}
