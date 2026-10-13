// Physics and Game Constants for VoxelPong 3D LAN

export const TABLE_DIMENSIONS = {
  length: 2.74,   // Z-axis (m)
  width: 1.525,   // X-axis (m)
  height: 0.76,   // Y-axis (m) surface height from ground
  halfLength: 1.37,
  halfWidth: 0.7625
} as const;

export const NET_DIMENSIONS = {
  height: 0.1525, // Height above table (m)
  topY: 0.76 + 0.1525, // 0.9125m
  width: 1.525 + 0.15, // Net overhangs 0.15m on sides
  z: 0.0
} as const;

export const BALL_PHYSICS = {
  radius: 0.02,        // 2 cm physical radius
  visualRadius: 0.03,  // 1.5x visual scaling for pixel depth readability
  gravity: 8.5,        // Arcade gravity (m/s^2), comfortable for mouse reaction
  tableRestitution: 0.88,
  paddleRestitution: 0.85,
  paddleTransferFactor: 0.60,
  maxSpeed: 12.0,      // Max clamped velocity (m/s)
  minServeSpeedZ: 3.5,
  smashMultiplier: 1.35
} as const;

export const PADDLE_PHYSICS = {
  radius: 0.09,              // 9 cm blade radius (visual)
  hitToleranceRadius: 0.18,  // Generous arcade hit tolerance for intuitive intercept
  thickness: 0.015,
  minX: -1.05,
  maxX: 1.05,
  minY: 0.72,
  maxY: 1.45,
  p1BaseZ: 1.62,       // Host / Player 1 stands at +Z facing -Z
  p2BaseZ: -1.62,      // Guest / Player 2 stands at -Z facing +Z
  swingDepthMax: 0.22, // Forward swing extension along Z
  smashCooldown: 0.60  // Seconds
} as const;

export const ASSIST_PRESETS = {
  casual: {
    maxSpeedScale: 0.70,
    hitToleranceRadius: 0.22, // 1.6x visual blade radius
    directionAssist: 0.40,    // 40% nudge towards center of opponent table
    showRing: true,
    showBounce: true
  },
  normal: {
    maxSpeedScale: 0.85,
    hitToleranceRadius: 0.18, // 1.3x visual blade radius (default)
    directionAssist: 0.20,    // 20% nudge towards center
    showRing: true,
    showBounce: true
  },
  pro: {
    maxSpeedScale: 1.00,
    hitToleranceRadius: 0.14, // 1.0x visual blade radius
    directionAssist: 0.00,    // 0% assist (pure raw physics)
    showRing: false,
    showBounce: false
  }
} as const;

export const SIMULATION = {
  tickRate: 120,       // 120 Hz fixed server step
  dt: 1 / 120,         // ~0.008333s
  snapshotRate: 60     // Broadcast 60 times/sec (every 2 ticks)
} as const;

export const MATCH_RULES = {
  pointsToWin: 11,
  minLeadToWin: 2,
  servesPerRotation: 2,
  servesPerRotationDeuce: 1,
  disconnectGracePeriodMs: 30000,
  ballStuckTimeoutSec: 10.0,
  countdownDurationSec: 3
} as const;
