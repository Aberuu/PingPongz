// Shared TypeScript Types for VoxelPong 3D LAN

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PlayerSlot = 'p1' | 'p2';
export type ClientRole = 'player' | 'spectator';
export type SpectatorCameraMode = 'broadcast' | 'courtside' | 'umpire';

export type AssistPreset = 'casual' | 'normal' | 'pro';
export type CameraMode = 'static' | 'subtle' | 'dynamic';
export type CameraPreset = 'ots' | 'high' | 'first-person';
export type ScreenJuice = 'off' | 'subtle' | 'full';
export type Handedness = 'right' | 'left';
export type GameMode = 'match' | 'practice' | 'bot';
export type PracticeZone = 'center' | 'left' | 'right' | 'random';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface PracticeStats {
  totalShots: number;
  returnedShots: number;
  ballsServed: number;
  ballsReturned: number;
  returnRate: number;
  zoneReturns: Record<PracticeZone, { total: number; returned: number }>;
}

export interface PaddleState {
  pos: Vec3;
  velocity: Vec3;
  pitch: number; // Radian rotation around X
  yaw: number;   // Radian rotation around Y
  roll: number;  // Radian rotation around Z
  isSmashing: boolean;
  isSlice?: boolean;
  footworkX?: number;
  assistPreset?: AssistPreset;
}

export interface BallState {
  pos: Vec3;
  velocity: Vec3;
}

export type GamePhase =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'SERVING'
  | 'RALLY'
  | 'POINT_SCORED'
  | 'PAUSED'
  | 'DISCONNECTED_PAUSE'
  | 'GAME_OVER';

export interface ScoreState {
  p1: number;
  p2: number;
}

export interface MatchStats {
  longestRally: number;
  currentRally: number;
  p1Smashes: number;
  p2Smashes: number;
  totalPoints: number;
  maxBallSpeed: number;
  returnHeatmap: number[][]; // 5 rows x 3 columns on opponent table
  rallyLengths: number[];
  smashesP1: number;
  smashesP2: number;
  acesP1: number;
  acesP2: number;
}

export interface SnapshotData {
  seq: number;
  tick?: number;
  serverTime: number;
  phase: GamePhase;
  score: ScoreState;
  serverSlot: PlayerSlot;
  ball: BallState;
  p1Paddle: PaddleState;
  p2Paddle: PaddleState;
  countdown: number;
  disconnectCountdown: number;
  pausedBy: PlayerSlot | null;
  winner: PlayerSlot | null;
  matchStats?: MatchStats;
  p1Rematch?: boolean;
  p2Rematch?: boolean;
  currentRallyShots?: number;
}

export type GameEventType =
  | 'TABLE_BOUNCE'
  | 'PADDLE_HIT'
  | 'NET_HIT'
  | 'POINT'
  | 'POINT_AWARDED'
  | 'LET'
  | 'SERVE_START'
  | 'MATCH_OVER'
  | 'RULE_ANNOUNCEMENT'
  | 'SPECTATOR_JOINED'
  | 'SPECTATOR_LEFT'
  | 'ROLE_CHANGED'
  | 'PLAYER_DISCONNECTED'
  | 'PLAYER_RECONNECTED'
  | 'PLAYER_EXPIRED';

export type RuleAnnouncementType =
  | 'DEUCE'
  | 'MATCH_POINT'
  | 'CHANGE_SERVE'
  | 'LET';

export interface RuleAnnouncement {
  id: string;
  type: RuleAnnouncementType;
  title: string;
  subtitle: string;
  player?: PlayerSlot;
  timestamp: number;
}

export interface GameEventData {
  type: GameEventType;
  payload?: {
    player?: PlayerSlot;
    winner?: PlayerSlot;
    pos?: Vec3;
    isSmash?: boolean;
    isSlice?: boolean;
    isSweetSpot?: boolean;
    reason?: string;
    score?: ScoreState;
    announcement?: RuleAnnouncement;
    rallyCount?: number;
    rallyMultiplier?: number;
    tick?: number;
    spectatorCount?: number;
    spectatorName?: string;
    newRole?: ClientRole;
    newSlot?: PlayerSlot;
    disconnectedSlot?: PlayerSlot;
    reconnectedSlot?: PlayerSlot;
  };
}

export interface ClientInputMsg {
  seq: number;
  clientTime: number;
  paddleX: number;
  paddleY: number;
  swingZ: number;
  pitch: number;
  yaw: number;
  roll: number;
  isSmash: boolean;
  isSlice?: boolean;
  footworkX?: number;
  assistPreset?: AssistPreset;
}

export interface RoomStateMsg {
  roomId?: string;
  role?: ClientRole;
  playerToken?: string;
  p1Connected: boolean;
  p2Connected: boolean;
  p1Ready: boolean;
  p2Ready: boolean;
  p1Name: string;
  p2Name: string;
  hostAddress: string;
  gameMode?: GameMode;
  botDifficulty?: BotDifficulty;
  practiceZone?: PracticeZone;
  p1Rematch?: boolean;
  p2Rematch?: boolean;
  dynamicRallyPower?: boolean;
  spectatorCount?: number;
  spectatorNames?: string[];
  maxSpectators?: number;
  disconnectedPlayerSlot?: PlayerSlot | null;
  disconnectCountdown?: number;
}

export interface ChatMessage {
  id: string;
  senderSlot: PlayerSlot | 'system' | 'bot' | 'spectator';
  senderName: string;
  text: string;
  timestamp: number;
  isQuickChat?: boolean;
  isSpectator?: boolean;
}

export interface TypingStatusMsg {
  senderSlot: PlayerSlot | 'spectator';
  isTyping: boolean;
}

export interface JoinRoomRequest {
  playerName: string;
  slot?: PlayerSlot;
  roomId?: string;
  role?: ClientRole;
  playerToken?: string;
  protocolVersion?: number;
}

