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
  minX: -1.25,               // Extended lateral reach for wide shots (table halfWidth 0.7625m + 0.49m)
  maxX: 1.25,
  minY: 0.72,
  maxY: 1.45,
  p1BaseZ: 1.62,       // Host / Player 1 stands at +Z facing -Z
  p2BaseZ: -1.62,      // Guest / Player 2 stands at -Z facing +Z
  swingDepthMax: 0.22, // Forward swing extension along Z
  smashCooldown: 0.60, // Seconds
  footworkMaxX: 0.60,  // Max baseline footwork displacement (+/- 0.60m)
  footworkSpeed: 1.5   // Footwork move speed (m/s)
} as const;

export const CAMERA_PRESETS = {
  ots: {
    baseY: 1.34,
    baseZ: 2.62,
    lookY: 0.76,
    lookZ: 0.12,
    shoulderOffset: 0.35, // Side offset per PRD formula to guarantee clear sightline
    shiftRatio: 0.88      // Follow character body 88% horizontally
  },
  high: {
    baseY: 1.75,
    baseZ: 2.75,
    lookY: 0.76,
    lookZ: 0.05,
    shoulderOffset: 0.20,
    shiftRatio: 0.60
  },
  'first-person': {
    baseY: 1.18,
    baseZ: 2.30,
    lookY: 0.76,
    lookZ: 0.12,
    shoulderOffset: 0.0,
    shiftRatio: 0.0
  }
} as const;

export const REACH_SYSTEM = {
  lateralPaddingStart: 0.45,
  lateralPaddingFactor: 0.10, // Additional hitbox radius per meter past lateralPaddingStart
  governorReactionTime: 0.25, // Assumed human visual-motor reaction time (s)
  governorReachSpeed: 3.4,    // Combined footwork and paddle reach speed (m/s)
  edgeDragReduction: 0.10     // 10% aerodynamic speed drop for diagonal edge shots
} as const;

export const PRACTICE_SETTINGS = {
  feedZ: -1.45,               // Spawns from opponent baseline
  feedY: 0.95,
  intervalSeconds: 2.5,
  zones: {
    center: { x: 0.0, z: 0.95 },
    left: { x: -0.58, z: 1.10 },
    right: { x: 0.58, z: 1.10 }
  }
} as const;

export const BOT_SETTINGS = {
  easy: {
    reactionTime: 0.45,
    errorJitter: 0.09,
    smashChance: 0.10,
    sliceChance: 0.05
  },
  medium: {
    reactionTime: 0.28,
    errorJitter: 0.04,
    smashChance: 0.35,
    sliceChance: 0.15
  },
  hard: {
    reactionTime: 0.18,
    errorJitter: 0.015,
    smashChance: 0.65,
    sliceChance: 0.25
  }
} as const;

export const ASSIST_PRESETS = {
  casual: {
    maxSpeedScale: 0.70,
    hitToleranceRadius: 0.22, // 1.6x visual blade radius
    directionAssist: 0.40,    // 40% nudge towards center of opponent table
    governorStrength: 1.0,    // 100% reach governor enforcement
    showRing: true,
    showBounce: true
  },
  normal: {
    maxSpeedScale: 0.85,
    hitToleranceRadius: 0.18, // 1.3x visual blade radius (default)
    directionAssist: 0.20,    // 20% nudge towards center
    governorStrength: 0.5,    // Partial governor enforcement
    showRing: true,
    showBounce: true
  },
  pro: {
    maxSpeedScale: 1.00,
    hitToleranceRadius: 0.14, // 1.0x visual blade radius
    directionAssist: 0.00,    // 0% assist (pure raw physics)
    governorStrength: 0.0,    // Off
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

export const RALLY_POWER_SYSTEM = {
  enabledDefault: true,
  startHitCount: 3,        // Escalation begins on the 3rd rally shot
  boostPerHit: 0.02,       // +2% velocity & power boost per hit beyond startHitCount
  maxMultiplier: 1.25      // Hard cap at 1.25x (+25% maximum) so it stays controllable and not overpowered
} as const;

export function calculateRallyMultiplier(rallyShots: number, enabled = true): number {
  if (!enabled || rallyShots < RALLY_POWER_SYSTEM.startHitCount) {
    return 1.0;
  }
  const extraHits = rallyShots - RALLY_POWER_SYSTEM.startHitCount;
  return Math.min(
    RALLY_POWER_SYSTEM.maxMultiplier,
    1.0 + extraHits * RALLY_POWER_SYSTEM.boostPerHit
  );
}

export const PROTOCOL_VERSION = 4;

export const SPECTATOR_CONFIG = {
  maxSpectators: 12,
  snapshotRate: 30, // 30Hz for spectators (every 4 ticks on 120Hz physics)
  chatCooldownMs: 1500
} as const;

export const RECONNECT_CONFIG = {
  gracePeriodSec: 30,
  backoffDelaysMs: [500, 1000, 2000, 3000]
} as const;

export const REPLAY_CONFIG = {
  bufferDurationSec: 6,
  bufferCapacity: 360, // 6 seconds * 60 snapshots/sec
  defaultDurationSec: 4,
  slowMoStartSec: 2.5,
  slowMoSpeed: 0.5,
  fpsDisableThreshold: 45
} as const;


