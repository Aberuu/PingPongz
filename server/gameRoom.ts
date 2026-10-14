import type { Server, Socket } from 'socket.io';
import {
  TABLE_DIMENSIONS,
  PADDLE_PHYSICS,
  BALL_PHYSICS,
  SIMULATION,
  MATCH_RULES,
  PRACTICE_SETTINGS,
  BOT_SETTINGS
} from '../shared/constants.js';
import type {
  PlayerSlot,
  ScoreState,
  GamePhase,
  BallState,
  PaddleState,
  SnapshotData,
  GameEventData,
  ClientInputMsg,
  RoomStateMsg,
  GameMode,
  BotDifficulty,
  PracticeZone,
  PracticeStats,
  MatchStats,
  ChatMessage,
  TypingStatusMsg
} from '../shared/types.js';
import {
  checkMatchWinner,
  determineServer,
  createInitialRallyState,
  detectRuleAnnouncement,
  type RallyState
} from '../shared/rules.js';
import { stepBallPhysics, clamp } from './physics.js';

interface ConnectedPlayer {
  id: string;
  socket: Socket | null;
  name: string;
  ready: boolean;
  rematch: boolean;
}

export class GameRoom {
  private io: Server;
  public p1: ConnectedPlayer | null = null;
  public p2: ConnectedPlayer | null = null;

  public gameMode: GameMode = 'match';
  public botDifficulty: BotDifficulty = 'medium';
  public practiceZone: PracticeZone = 'random';
  public practiceStats: PracticeStats = {
    totalShots: 0,
    returnedShots: 0,
    ballsServed: 0,
    ballsReturned: 0,
    returnRate: 0,
    zoneReturns: {
      center: { total: 0, returned: 0 },
      left: { total: 0, returned: 0 },
      right: { total: 0, returned: 0 },
      random: { total: 0, returned: 0 }
    }
  };
  public matchStats: MatchStats = {
    longestRally: 0,
    currentRally: 0,
    p1Smashes: 0,
    p2Smashes: 0,
    totalPoints: 0,
    rallyLengths: [],
    maxBallSpeed: 0,
    smashesP1: 0,
    smashesP2: 0,
    acesP1: 0,
    acesP2: 0,
    returnHeatmap: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ]
  };
  public replayBuffer: SnapshotData[] = [];
  public hostAddress = '';

  public phase: GamePhase = 'LOBBY';
  public score: ScoreState = { p1: 0, p2: 0 };
  public initialServer: PlayerSlot = 'p1';
  public currentServer: PlayerSlot = 'p1';
  public winner: PlayerSlot | null = null;

  public ball: BallState = {
    pos: { x: 0, y: TABLE_DIMENSIONS.height + 0.15, z: PADDLE_PHYSICS.p1BaseZ - 0.2 },
    velocity: { x: 0, y: 0, z: 0 }
  };

  public p1Paddle: PaddleState = {
    pos: { x: 0, y: 0.95, z: PADDLE_PHYSICS.p1BaseZ },
    velocity: { x: 0, y: 0, z: 0 },
    pitch: 0,
    yaw: 0,
    roll: 0,
    isSmashing: false
  };

  public p2Paddle: PaddleState = {
    pos: { x: 0, y: 0.95, z: PADDLE_PHYSICS.p2BaseZ },
    velocity: { x: 0, y: 0, z: 0 },
    pitch: 0,
    yaw: 0,
    roll: 0,
    isSmashing: false
  };

  private rallyState: RallyState = createInitialRallyState('p1');
  private sequence = 0;
  private loopTimer: NodeJS.Timeout | null = null;
  private countdownRemaining = 3;
  private disconnectRemaining = 30;
  private pausedBy: PlayerSlot | null = null;
  private lastTickTime = Date.now();
  private ticksSinceSnapshot = 0;
  private pointTransitionTimer = 0;
  private ballInactivityTimer = 0;
  private disconnectInterval: NodeJS.Timeout | null = null;
  private practiceFeedTimer = 0;
  private botReactionTimer = 0;
  private botTargetPos = { x: 0, y: 0.95 };
  private botSwingTimer = 0;
  private botServeTimer = 0;
  private currentRallyShots = 0;
  public roomId: string;

  constructor(io: Server, roomId = 'MAIN') {
    this.io = io;
    this.roomId = roomId.trim().toUpperCase();
    this.startSimulationLoop();
  }

  public getRoomState(hostAddress = this.hostAddress): RoomStateMsg {
    const finalHost = hostAddress || this.hostAddress;
    return {
      roomId: this.roomId,
      p1Connected: !!this.p1,
      p2Connected: !!this.p2,
      p1Ready: !!this.p1?.ready,
      p2Ready: !!this.p2?.ready,
      p1Name: this.p1?.name || 'Player 1',
      p2Name: this.p2?.name || (this.gameMode === 'bot' ? `Bot (${this.botDifficulty.toUpperCase()})` : (this.gameMode === 'practice' ? 'Ball Machine' : 'Player 2')),
      hostAddress: finalHost,
      gameMode: this.gameMode,
      botDifficulty: this.botDifficulty,
      practiceZone: this.practiceZone,
      p1Rematch: !!this.p1?.rematch,
      p2Rematch: !!this.p2?.rematch
    };
  }

  public broadcastRoomState(hostAddress = this.hostAddress) {
    if (hostAddress) this.hostAddress = hostAddress;
    this.io.to(this.roomId).emit('s2c_room_state', this.getRoomState(this.hostAddress));
  }

  public handleSetMode(mode: GameMode, botDifficulty?: BotDifficulty, practiceZone?: PracticeZone, hostAddress = '') {
    this.gameMode = mode;
    if (botDifficulty) this.botDifficulty = botDifficulty;
    if (practiceZone) this.practiceZone = practiceZone;

    if (mode === 'bot') {
      this.p2 = {
        id: 'bot-player',
        socket: null,
        name: `Bot ${this.botDifficulty.toUpperCase()}`,
        ready: true,
        rematch: true
      };
    } else if (mode === 'practice') {
      this.p2 = {
        id: 'practice-machine',
        socket: null,
        name: 'Ball Machine',
        ready: true,
        rematch: true
      };
      this.practiceStats = {
        totalShots: 0,
        returnedShots: 0,
        ballsServed: 0,
        ballsReturned: 0,
        returnRate: 0,
        zoneReturns: {
          center: { total: 0, returned: 0 },
          left: { total: 0, returned: 0 },
          right: { total: 0, returned: 0 },
          random: { total: 0, returned: 0 }
        }
      };
    } else if (mode === 'match') {
      if (this.p2?.id === 'bot-player' || this.p2?.id === 'practice-machine') {
        this.p2 = null;
      }
    }

    this.broadcastRoomState(hostAddress);
  }

  public handleSetPracticeZone(zone: PracticeZone, hostAddress = '') {
    this.practiceZone = zone;
    this.broadcastRoomState(hostAddress);
  }

  public autoAssignSlotOnConnect(socket: Socket): PlayerSlot {
    if (!this.p1) {
      this.p1 = { id: socket.id, socket, name: 'Pemain 1', ready: false, rematch: false };
      return 'p1';
    } else if (!this.p2 && this.p1.id !== socket.id) {
      this.p2 = { id: socket.id, socket, name: 'Pemain 2', ready: false, rematch: false };
      return 'p2';
    } else if (this.p1.id === socket.id) {
      return 'p1';
    } else if (this.p2 && this.p2.id === socket.id) {
      return 'p2';
    }
    return 'p2';
  }

  public handleJoin(socket: Socket, name: string, preferredSlot?: PlayerSlot, hostAddress = '') {
    const defaultName = preferredSlot === 'p2' ? 'Pemain 2' : 'Pemain 1';
    const playerName = (name || '').trim().slice(0, 15) || defaultName;

    // Slot switching if requested
    if (preferredSlot === 'p2') {
      if (this.p1 && this.p1.id === socket.id && !this.p2) {
        // Switch from P1 to P2
        this.p2 = { id: socket.id, socket, name: playerName, ready: false, rematch: false };
        this.p1 = null;
        socket.emit('s2c_assigned_slot', { slot: 'p2' });
      } else if (!this.p2) {
        this.p2 = { id: socket.id, socket, name: playerName, ready: false, rematch: false };
        socket.emit('s2c_assigned_slot', { slot: 'p2' });
      } else if (this.p2.id === socket.id) {
        this.p2.name = playerName;
        socket.emit('s2c_assigned_slot', { slot: 'p2' });
      }
    } else if (preferredSlot === 'p1') {
      if (this.p2 && this.p2.id === socket.id && !this.p1) {
        // Switch from P2 to P1
        this.p1 = { id: socket.id, socket, name: playerName, ready: false, rematch: false };
        this.p2 = null;
        socket.emit('s2c_assigned_slot', { slot: 'p1' });
      } else if (!this.p1) {
        this.p1 = { id: socket.id, socket, name: playerName, ready: false, rematch: false };
        socket.emit('s2c_assigned_slot', { slot: 'p1' });
      } else if (this.p1.id === socket.id) {
        this.p1.name = playerName;
        socket.emit('s2c_assigned_slot', { slot: 'p1' });
      }
    } else {
      // No preference, assign first available
      if (!this.p1) {
        this.p1 = { id: socket.id, socket, name: playerName, ready: false, rematch: false };
        socket.emit('s2c_assigned_slot', { slot: 'p1' });
      } else if (!this.p2 && this.p1.id !== socket.id) {
        this.p2 = { id: socket.id, socket, name: playerName, ready: false, rematch: false };
        socket.emit('s2c_assigned_slot', { slot: 'p2' });
      }
    }

    // If game was paused waiting for disconnected player to rejoin
    if (this.phase === 'DISCONNECTED_PAUSE') {
      this.stopDisconnectTimer();
      this.startCountdown();
    }

    this.broadcastRoomState(hostAddress);
  }

  public handleReady(socket: Socket, ready: boolean, hostAddress = '') {
    if (this.p1 && this.p1.id === socket.id) this.p1.ready = ready;
    if (this.p2 && this.p2.id === socket.id) this.p2.ready = ready;

    // Bot / machine is always ready
    if ((this.gameMode === 'bot' || this.gameMode === 'practice') && this.p2) {
      this.p2.ready = true;
    }

    this.broadcastRoomState(hostAddress);

    if (this.p1?.ready && this.p2?.ready && this.phase === 'LOBBY') {
      this.startCountdown();
    }
  }

  public handleInput(socket: Socket, input: ClientInputMsg) {
    const isP1 = this.p1?.id === socket.id;
    const isP2 = this.p2?.id === socket.id;
    if (!isP1 && !isP2) return;

    const paddle = isP1 ? this.p1Paddle : this.p2Paddle;
    const baseZ = isP1 ? PADDLE_PHYSICS.p1BaseZ : PADDLE_PHYSICS.p2BaseZ;
    const zDir = isP1 ? -1 : 1;

    // Validate and clamp input
    const clampedX = clamp(input.paddleX, PADDLE_PHYSICS.minX, PADDLE_PHYSICS.maxX);
    const clampedY = clamp(input.paddleY, PADDLE_PHYSICS.minY, PADDLE_PHYSICS.maxY);
    const clampedSwing = clamp(input.swingZ, 0, PADDLE_PHYSICS.swingDepthMax);
    const targetZ = baseZ + zDir * clampedSwing;

    // Compute velocity
    const dt = SIMULATION.dt;
    paddle.velocity = {
      x: (clampedX - paddle.pos.x) / dt,
      y: (clampedY - paddle.pos.y) / dt,
      z: (targetZ - paddle.pos.z) / dt
    };

    paddle.pos = { x: clampedX, y: clampedY, z: targetZ };
    paddle.pitch = clamp(input.pitch, -Math.PI / 4, Math.PI / 4);
    paddle.yaw = clamp(input.yaw, -Math.PI / 4, Math.PI / 4);
    paddle.roll = clamp(input.roll, -Math.PI / 4, Math.PI / 4);
    paddle.isSmashing = !!input.isSmash;
    paddle.isSlice = !!input.isSlice;
    paddle.footworkX = input.footworkX ?? 0;
    if (input.assistPreset) {
      paddle.assistPreset = input.assistPreset;
    }

    // In SERVING phase, ball dynamically follows server's paddle along baseline
    if (this.phase === 'SERVING' && ((isP1 && this.currentServer === 'p1') || (isP2 && this.currentServer === 'p2'))) {
      const zOffset = isP1 ? -0.16 : 0.16;
      this.ball.pos = {
        x: clamp(clampedX, -TABLE_DIMENSIONS.halfWidth * 0.95, TABLE_DIMENSIONS.halfWidth * 0.95),
        y: clamp(clampedY + 0.04, TABLE_DIMENSIONS.height + 0.08, TABLE_DIMENSIONS.height + 0.35),
        z: targetZ + zOffset
      };
      this.ball.velocity = { x: 0, y: 0, z: 0 };
    }
  }

  public handleServeAction(socket: Socket) {
    const isP1 = this.p1?.id === socket.id;
    const isP2 = this.p2?.id === socket.id;
    const slot: PlayerSlot = isP1 ? 'p1' : 'p2';

    if (this.phase === 'SERVING' && this.currentServer === slot) {
      this.executeServeToss();
    }
  }

  public handlePauseToggle(socket: Socket) {
    if (this.phase === 'GAME_OVER' || this.phase === 'LOBBY') return;

    const isP1 = this.p1?.id === socket.id;
    const isP2 = this.p2?.id === socket.id;
    const slot: PlayerSlot = isP1 ? 'p1' : 'p2';

    if (this.phase === 'PAUSED') {
      // Resume game
      this.startCountdown();
    } else if (this.phase === 'RALLY' || this.phase === 'SERVING' || this.phase === 'COUNTDOWN') {
      this.phase = 'PAUSED';
      this.pausedBy = slot;
      this.emitEvent({ type: 'LET', payload: { reason: `Game paused by ${slot === 'p1' ? this.p1?.name : this.p2?.name}` } });
    }
  }

  public handleRematch(socket: Socket, data?: { slot?: PlayerSlot }, hostAddress = '') {
    if (this.phase !== 'GAME_OVER') return;
    if (hostAddress) this.hostAddress = hostAddress;

    if (this.p1 && (this.p1.id === socket.id || data?.slot === 'p1')) {
      this.p1.rematch = !this.p1.rematch;
      this.p1.ready = this.p1.rematch;
    }
    if (this.p2 && (this.p2.id === socket.id || data?.slot === 'p2')) {
      this.p2.rematch = !this.p2.rematch;
      this.p2.ready = this.p2.rematch;
    }

    if (this.gameMode === 'bot' || this.gameMode === 'practice') {
      if (this.p2) {
        this.p2.rematch = true;
        this.p2.ready = true;
      }
    }

    this.broadcastRoomState(this.hostAddress);
    this.broadcastSnapshot();

    if (this.p1?.rematch && this.p2?.rematch) {
      // Reset match
      this.score = { p1: 0, p2: 0 };
      // Loser serves first
      this.initialServer = this.winner === 'p1' ? 'p2' : 'p1';
      this.currentServer = this.initialServer;
      this.winner = null;
      this.p1.rematch = false;
      this.p2.rematch = false;
      this.broadcastRoomState(this.hostAddress);
      this.broadcastSnapshot();
      this.startCountdown();
    }
  }

  public handleQuitToLobby(hostAddress = '') {
    if (hostAddress) this.hostAddress = hostAddress;
    this.phase = 'LOBBY';
    this.score = { p1: 0, p2: 0 };
    this.winner = null;
    this.pausedBy = null;
    this.countdownRemaining = 3;
    if (this.p1) {
      this.p1.ready = false;
      this.p1.rematch = false;
    }
    if (this.p2) {
      this.p2.ready = this.gameMode === 'bot' || this.gameMode === 'practice';
      this.p2.rematch = false;
    }
    this.ball = {
      pos: { x: 0, y: TABLE_DIMENSIONS.height + 0.15, z: PADDLE_PHYSICS.p1BaseZ - 0.2 },
      velocity: { x: 0, y: 0, z: 0 }
    };
    this.rallyState = createInitialRallyState('p1');
    this.broadcastRoomState(this.hostAddress);
    this.broadcastSnapshot();
  }

  public handleDisconnect(socket: Socket, hostAddress = '') {
    const wasP1 = this.p1?.id === socket.id;
    const wasP2 = this.p2?.id === socket.id;

    if (wasP1) this.p1 = null;
    if (wasP2) this.p2 = null;

    if (this.phase === 'RALLY' || this.phase === 'SERVING' || this.phase === 'COUNTDOWN' || this.phase === 'PAUSED') {
      this.phase = 'DISCONNECTED_PAUSE';
      this.startDisconnectTimer(hostAddress);
    } else if (this.phase === 'LOBBY') {
      this.broadcastRoomState(hostAddress);
    }
  }

  public handleChatMessage(socket: Socket, data: { text: string; isQuickChat?: boolean }) {
    if (!data || typeof data.text !== 'string') return;
    const cleanText = data.text.trim().slice(0, 120);
    if (!cleanText) return;

    let senderSlot: PlayerSlot | 'system' = 'system';
    let senderName = 'Penonton';

    if (this.p1 && socket.id === this.p1.id) {
      senderSlot = 'p1';
      senderName = this.p1.name || 'Pemain 1';
    } else if (this.p2 && socket.id === this.p2.id) {
      senderSlot = 'p2';
      senderName = this.p2.name || 'Pemain 2';
    }

    const chatMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderSlot,
      senderName,
      text: cleanText,
      timestamp: Date.now(),
      isQuickChat: Boolean(data.isQuickChat)
    };

    this.io.to(this.roomId).emit('s2c_chat_message', chatMsg);

    if (this.gameMode === 'bot' && senderSlot === 'p1') {
      this.triggerBotChatResponse(cleanText);
    }
  }

  public handleTypingStatus(socket: Socket, isTyping: boolean) {
    let senderSlot: PlayerSlot | null = null;
    if (this.p1 && socket.id === this.p1.id) {
      senderSlot = 'p1';
    } else if (this.p2 && socket.id === this.p2.id) {
      senderSlot = 'p2';
    }

    if (senderSlot) {
      const msg: TypingStatusMsg = {
        senderSlot,
        isTyping: Boolean(isTyping)
      };
      socket.to(this.roomId).emit('s2c_typing', msg);
    }
  }

  private triggerBotChatResponse(playerText: string) {
    const lower = playerText.toLowerCase();
    let reply = '';
    if (lower.includes('gg') || lower.includes('good game')) {
      reply = 'GG! Permainan hebat!';
    } else if (lower.includes('halo') || lower.includes('hai') || lower.includes('hi')) {
      reply = 'Halo! Siap menerima servis?';
    } else if (lower.includes('lag') || lower.includes('delay')) {
      reply = 'Sensor saya mendeteksi latensi 0ms!';
    } else if (lower.includes('rematch') || lower.includes('lagi')) {
      reply = 'Tentu saja, ayo bertanding lagi!';
    } else if (Math.random() < 0.45) {
      const botReplies = [
        'Pukulan yang menarik!',
        'Saya terus mempelajari gaya bermainmu.',
        'Fokus ke bola!',
        'Bagus, ayo rally lebih lama!'
      ];
      reply = botReplies[Math.floor(Math.random() * botReplies.length)];
    }

    if (reply) {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `${Date.now()}-bot`,
          senderSlot: 'bot',
          senderName: 'VoxelBot',
          text: reply,
          timestamp: Date.now(),
          isQuickChat: false
        };
        this.io.to(this.roomId).emit('s2c_chat_message', botMsg);
      }, 700 + Math.random() * 800);
    }
  }

  private startCountdown() {
    this.phase = 'COUNTDOWN';
    this.countdownRemaining = MATCH_RULES.countdownDurationSec;
    this.pausedBy = null;

    const interval = setInterval(() => {
      this.countdownRemaining -= 1;
      if (this.countdownRemaining <= 0) {
        clearInterval(interval);
        this.resetBallToServe();
      }
    }, 1000);
  }

  private startDisconnectTimer(hostAddress: string) {
    this.disconnectRemaining = MATCH_RULES.disconnectGracePeriodMs / 1000;
    if (this.disconnectInterval) clearInterval(this.disconnectInterval);

    this.disconnectInterval = setInterval(() => {
      this.disconnectRemaining -= 1;
      if (this.disconnectRemaining <= 0) {
        this.stopDisconnectTimer();
        // Reset to lobby
        this.phase = 'LOBBY';
        this.score = { p1: 0, p2: 0 };
        this.winner = null;
        if (this.p1) this.p1.ready = false;
        if (this.p2) this.p2.ready = false;
        this.broadcastRoomState(hostAddress);
      }
    }, 1000);
  }

  private stopDisconnectTimer() {
    if (this.disconnectInterval) {
      clearInterval(this.disconnectInterval);
      this.disconnectInterval = null;
    }
  }

  private resetBallToServe() {
    if (this.gameMode === 'practice') {
      this.feedPracticeBall();
      return;
    }

    this.phase = 'SERVING';
    this.ballInactivityTimer = 0;
    this.rallyState = createInitialRallyState(this.currentServer);

    const isP1 = this.currentServer === 'p1';
    const serverPaddle = isP1 ? this.p1Paddle : this.p2Paddle;

    // Place ball comfortably in front of server paddle
    const zOffset = isP1 ? -0.15 : 0.15;
    this.ball.pos = {
      x: serverPaddle.pos.x,
      y: serverPaddle.pos.y + 0.10,
      z: serverPaddle.pos.z + zOffset
    };
    this.ball.velocity = { x: 0, y: 0, z: 0 };

    this.emitEvent({
      type: 'SERVE_START',
      payload: { player: this.currentServer }
    });
  }

  public feedPracticeBall() {
    this.phase = 'RALLY';
    this.ballInactivityTimer = 0;
    this.rallyState = createInitialRallyState('p2');
    this.rallyState.isServeRally = false;
    this.rallyState.lastHitter = 'p2';
    this.rallyState.bouncesOnSide = { p1: 0, p2: 0 };

    let zoneKey: 'center' | 'left' | 'right' = 'center';
    if (this.practiceZone === 'random') {
      const candidates: ('center' | 'left' | 'right')[] = ['center', 'left', 'right'];
      zoneKey = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      zoneKey = this.practiceZone;
    }
    const target = PRACTICE_SETTINGS.zones[zoneKey];

    const feedX = 0;
    const feedY = PRACTICE_SETTINGS.feedY;
    const feedZ = PRACTICE_SETTINGS.feedZ;
    this.ball.pos = { x: feedX, y: feedY, z: feedZ };

    // Trajectory to target bounce point on P1 table half
    const flightTime = 0.58;
    const targetY = TABLE_DIMENSIONS.height + BALL_PHYSICS.radius;
    const vx = (target.x - feedX) / flightTime;
    const vz = (target.z - feedZ) / flightTime;
    const vy = (targetY - feedY + 0.5 * BALL_PHYSICS.gravity * flightTime * flightTime) / flightTime;

    this.ball.velocity = { x: vx, y: vy, z: vz };
    this.practiceStats.ballsServed += 1;
    this.practiceStats.totalShots += 1;
    this.practiceStats.returnRate = Math.round(
      (this.practiceStats.ballsReturned / this.practiceStats.ballsServed) * 100
    );

    this.emitEvent({
      type: 'PADDLE_HIT',
      payload: { player: 'p2', isSmash: false, pos: { ...this.ball.pos } }
    });
  }

  private simulateBot(dt: number) {
    if (this.gameMode !== 'bot') return;

    // Handle bot serving
    if (this.phase === 'SERVING' && this.currentServer === 'p2') {
      this.botServeTimer += dt;
      if (this.botServeTimer >= 1.0) {
        this.botServeTimer = 0;
        this.executeServeToss();
      }
      return;
    }

    if (this.phase !== 'RALLY') return;

    const cfg = BOT_SETTINGS[this.botDifficulty];

    // Check if ball is moving towards P2 (vz < -0.1)
    if (this.ball.velocity.z < -0.1) {
      const dz = PADDLE_PHYSICS.p2BaseZ - this.ball.pos.z;
      const timeToArrive = dz / this.ball.velocity.z;

      if (timeToArrive > 0 && timeToArrive < 2.0) {
        this.botReactionTimer += dt;
        if (this.botReactionTimer >= cfg.reactionTime) {
          const predX = this.ball.pos.x + this.ball.velocity.x * timeToArrive;
          const jitter = (Math.random() - 0.5) * 2 * cfg.errorJitter;
          this.botTargetPos.x = clamp(predX + jitter, PADDLE_PHYSICS.minX, PADDLE_PHYSICS.maxX);

          const predY = Math.max(
            TABLE_DIMENSIONS.height + 0.12,
            this.ball.pos.y + this.ball.velocity.y * timeToArrive - 0.5 * BALL_PHYSICS.gravity * timeToArrive * timeToArrive
          );
          this.botTargetPos.y = clamp(predY, PADDLE_PHYSICS.minY, PADDLE_PHYSICS.maxY);
        }
      }
    } else {
      // Ball moving away, reset reaction timer and drift back to center
      this.botReactionTimer = 0;
      this.botTargetPos.x = 0;
      this.botTargetPos.y = 0.95;
    }

    // Move bot paddle smoothly toward target
    const speed = this.botDifficulty === 'hard' ? 6.2 : (this.botDifficulty === 'medium' ? 4.5 : 3.0);
    const dx = this.botTargetPos.x - this.p2Paddle.pos.x;
    const dy = this.botTargetPos.y - this.p2Paddle.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.005) {
      const step = Math.min(dist, speed * dt);
      this.p2Paddle.pos.x += (dx / dist) * step;
      this.p2Paddle.pos.y += (dy / dist) * step;
      this.p2Paddle.velocity.x = (dx / dist) * speed;
      this.p2Paddle.velocity.y = (dy / dist) * speed;
    } else {
      this.p2Paddle.velocity.x = 0;
      this.p2Paddle.velocity.y = 0;
    }

    // Bot swing execution when ball is within reaching distance
    const distZ = Math.abs(this.ball.pos.z - PADDLE_PHYSICS.p2BaseZ);
    if (distZ < 0.32 && this.botSwingTimer <= 0 && this.ball.velocity.z < 0) {
      const roll = Math.random();
      const shouldSmash = roll < cfg.smashChance;
      const shouldSlice = !shouldSmash && roll < (cfg.smashChance + cfg.sliceChance);

      this.p2Paddle.isSmashing = shouldSmash;
      this.p2Paddle.isSlice = shouldSlice;
      const botInwardBias = Math.atan2(this.p2Paddle.pos.x, 1.8);
      this.p2Paddle.yaw = botInwardBias + (Math.random() - 0.5) * 0.14;
      this.p2Paddle.pos.z = PADDLE_PHYSICS.p2BaseZ + 0.14;
      this.p2Paddle.velocity.z = 2.4;
      this.botSwingTimer = 0.35;
    }

    if (this.botSwingTimer > 0) {
      this.botSwingTimer -= dt;
      if (this.botSwingTimer <= 0) {
        this.p2Paddle.pos.z = PADDLE_PHYSICS.p2BaseZ;
        this.p2Paddle.velocity.z = 0;
        this.p2Paddle.isSmashing = false;
        this.p2Paddle.isSlice = false;
      }
    }
  }

  private executeServeToss() {
    if (this.phase !== 'SERVING') return;

    this.phase = 'RALLY';
    this.rallyState.isServeRally = true;
    this.rallyState.servePhase = 'MUST_BOUNCE_SERVER_SIDE';
    this.rallyState.lastHitter = this.currentServer;

    const isP1 = this.currentServer === 'p1';
    const serverPaddle = isP1 ? this.p1Paddle : this.p2Paddle;
    const dirZ = isP1 ? -1 : 1;

    // Authentic arcade serve velocity (symmetric for both Red and Blue side):
    // Positive yaw turns paddle inward from the right, requiring negative vx towards center
    const forwardSpeed = 4.3;
    const vx = -Math.sin(serverPaddle.yaw) * forwardSpeed;
    const vz = dirZ * Math.cos(serverPaddle.yaw) * forwardSpeed;
    const vy = -1.15; // Dips onto server's own table half first

    this.ball.velocity = {
      x: vx,
      y: vy,
      z: vz
    };

    this.emitEvent({
      type: 'PADDLE_HIT',
      payload: { player: this.currentServer, isSmash: false, pos: { ...this.ball.pos } }
    });
  }

  private awardPoint(winner: PlayerSlot, reason: string) {
    if (this.gameMode === 'practice') {
      setTimeout(() => {
        if (this.gameMode === 'practice') this.feedPracticeBall();
      }, 750);
      return;
    }

    const prevScore = { ...this.score };
    if (winner === 'p1') this.score.p1 += 1;
    else this.score.p2 += 1;

    this.matchStats.rallyLengths.push(this.currentRallyShots);
    this.matchStats.longestRally = Math.max(this.matchStats.longestRally, this.currentRallyShots);
    this.matchStats.totalPoints += 1;
    if (this.currentRallyShots <= 1) {
      if (winner === 'p1') this.matchStats.acesP1 += 1;
      else this.matchStats.acesP2 += 1;
    }
    this.currentRallyShots = 0;

    this.phase = 'POINT_SCORED';
    this.pointTransitionTimer = 1.6; // 1.6 second display delay

    this.emitEvent({
      type: 'POINT',
      payload: {
        winner,
        reason,
        score: { ...this.score }
      }
    });

    // Check for Table Tennis Rule Announcements (DEUCE, MATCH POINT / ADVANTAGE)
    const announcement = detectRuleAnnouncement(
      prevScore,
      this.score,
      this.p1?.name || 'Pemain 1',
      this.p2?.name || (this.gameMode === 'bot' ? 'VoxelBot' : 'Pemain 2')
    );

    if (announcement) {
      this.emitEvent({
        type: 'RULE_ANNOUNCEMENT',
        payload: { announcement }
      });
    }

    const matchWinner = checkMatchWinner(this.score);
    if (matchWinner) {
      this.winner = matchWinner;
      this.phase = 'GAME_OVER';
      if (this.p1) {
        this.p1.rematch = false;
        this.p1.ready = false;
      }
      if (this.p2) {
        this.p2.rematch = this.gameMode === 'bot';
        this.p2.ready = this.gameMode === 'bot';
      }
      this.broadcastRoomState(this.hostAddress);
      this.broadcastSnapshot();
      this.emitEvent({
        type: 'MATCH_OVER',
        payload: {
          winner: matchWinner,
          score: { ...this.score }
        }
      });
      return;
    }

    // Determine next server & announce serve rotation if changed
    const previousServer = this.currentServer;
    this.currentServer = determineServer(this.initialServer, this.score);

    if (previousServer !== this.currentServer && !announcement) {
      const nextServerName = this.currentServer === 'p1' ? (this.p1?.name || 'Pemain 1') : (this.p2?.name || (this.gameMode === 'bot' ? 'VoxelBot' : 'Pemain 2'));
      this.emitEvent({
        type: 'RULE_ANNOUNCEMENT',
        payload: {
          announcement: {
            id: `${Date.now()}-serve`,
            type: 'CHANGE_SERVE',
            title: 'GANTI SERVIS!',
            subtitle: `Giliran servis berpindah ke ${nextServerName}.`,
            player: this.currentServer,
            timestamp: Date.now()
          }
        }
      });
    }
  }

  private emitEvent(event: GameEventData) {
    this.io.to(this.roomId).emit('s2c_event', event);
  }

  private startSimulationLoop() {
    this.loopTimer = setInterval(() => {
      this.tick();
    }, 1000 / SIMULATION.tickRate);
  }

  private tick() {
    const dt = SIMULATION.dt;
    this.sequence += 1;

    // Simulate Bot AI if in bot mode
    this.simulateBot(dt);

    // Track max ball speed
    const currentSpeed = Math.sqrt(
      this.ball.velocity.x * this.ball.velocity.x +
      this.ball.velocity.y * this.ball.velocity.y +
      this.ball.velocity.z * this.ball.velocity.z
    );
    if (currentSpeed > this.matchStats.maxBallSpeed) {
      this.matchStats.maxBallSpeed = Math.round(currentSpeed * 10) / 10;
    }

    // Handle point transition delay
    if (this.phase === 'POINT_SCORED') {
      this.pointTransitionTimer -= dt;
      if (this.pointTransitionTimer <= 0) {
        this.resetBallToServe();
      }
    }

    // Active physics during RALLY
    if (this.phase === 'RALLY') {
      this.ballInactivityTimer += dt;
      if (this.ballInactivityTimer >= MATCH_RULES.ballStuckTimeoutSec) {
        this.emitEvent({ type: 'LET', payload: { reason: 'Ball inactive' } });
        this.resetBallToServe();
        return;
      }

      // Can hit checks based on table tennis rules:
      // Player can hit if it bounced on their side OR during serve reception
      const canP1Hit = this.rallyState.lastHitter !== 'p1';
      const canP2Hit = this.rallyState.lastHitter !== 'p2';

      const result = stepBallPhysics(
        this.ball,
        this.p1Paddle,
        this.p2Paddle,
        dt,
        canP1Hit,
        canP2Hit
      );

      // Process physics events
      for (const event of result.events) {
        this.emitEvent(event);

        if (event.type === 'PADDLE_HIT' && event.payload?.player) {
          this.ballInactivityTimer = 0;
          this.currentRallyShots += 1;
          const hitter = event.payload.player;
          const receiver = hitter === 'p1' ? 'p2' : 'p1';

          if (event.payload?.isSmash) {
            if (hitter === 'p1') {
              this.matchStats.smashesP1 += 1;
              this.matchStats.p1Smashes += 1;
            } else {
              this.matchStats.smashesP2 += 1;
              this.matchStats.p2Smashes += 1;
            }
          }

          if (this.gameMode === 'practice' && hitter === 'p1') {
            this.practiceStats.ballsReturned += 1;
            this.practiceStats.returnedShots += 1;
            this.practiceStats.returnRate = Math.round(
              (this.practiceStats.ballsReturned / this.practiceStats.ballsServed) * 100
            );
          }

          // Volley violation check:
          // In table tennis, player must let the ball bounce on their side before striking it
          if (!this.rallyState.isServeRally && this.rallyState.bouncesOnSide[hitter] === 0) {
            this.awardPoint(receiver, `${hitter.toUpperCase()} volleyed ball before bounce`);
            return;
          }

          this.rallyState.lastHitter = hitter;
          this.rallyState.bouncesOnSide = { p1: 0, p2: 0 };
          this.rallyState.touchedNetThisTurn = false;
          if (this.rallyState.isServeRally) {
            this.rallyState.isServeRally = false;
          }
          // Immediately broadcast snapshot on paddle hit to eliminate sync delay
          this.broadcastSnapshot();
        }

        if (event.type === 'TABLE_BOUNCE' && event.payload?.player) {
          const side = event.payload.player;
          this.rallyState.bouncesOnSide[side] += 1;

          // Record heatmap bounce
          const bouncePos = event.payload?.pos || this.ball.pos;
          const zDepthRatio = Math.min(1.0, Math.abs(bouncePos.z) / TABLE_DIMENSIONS.halfLength);
          const rowIndex = clamp(Math.floor(zDepthRatio * 5), 0, 4);
          let colIndex = 1;
          if (bouncePos.x < -0.25) colIndex = 0;
          else if (bouncePos.x > 0.25) colIndex = 2;
          this.matchStats.returnHeatmap[rowIndex][colIndex] += 1;

          if (this.rallyState.isServeRally) {
            if (this.rallyState.servePhase === 'MUST_BOUNCE_SERVER_SIDE') {
              if (side !== this.currentServer) {
                const opponent = this.currentServer === 'p1' ? 'p2' : 'p1';
                this.awardPoint(opponent, 'Fault: serve failed to bounce on server side');
                return;
              }
              this.rallyState.servePhase = 'MUST_CROSS_NET';
            } else if (this.rallyState.servePhase === 'MUST_CROSS_NET') {
              if (side === this.currentServer) {
                const opponent = this.currentServer === 'p1' ? 'p2' : 'p1';
                this.awardPoint(opponent, 'Fault: serve bounced twice on server side');
                return;
              }
              // Check net let on serve
              if (this.rallyState.touchedNetThisTurn) {
                this.emitEvent({ type: 'LET', payload: { reason: 'Net serve' } });
                this.resetBallToServe();
                return;
              }
              this.rallyState.servePhase = 'NORMAL';
              this.rallyState.isServeRally = false;
            }
          } else {
            // Normal rally double bounce check
            if (this.rallyState.bouncesOnSide[side] > 1) {
              const pointWinner = side === 'p1' ? 'p2' : 'p1';
              this.awardPoint(pointWinner, `Double bounce on ${side.toUpperCase()} table half`);
              return;
            }
          }
        }

        if (event.type === 'NET_HIT') {
          this.rallyState.touchedNetThisTurn = true;
        }
      }

      // Check out of bounds / floor hit
      if (result.ballHitFloor) {
        if (this.gameMode === 'practice') {
          setTimeout(() => {
            if (this.gameMode === 'practice') this.feedPracticeBall();
          }, 750);
          return;
        }

        const hitter = this.rallyState.lastHitter;
        const opponent = hitter === 'p1' ? 'p2' : 'p1';

        if (!hitter) {
          // Serve fault
          const receiver = this.currentServer === 'p1' ? 'p2' : 'p1';
          this.awardPoint(receiver, 'Serve missed table');
        } else {
          // If ball bounced on opponent's side, and now hit floor -> hitter scored!
          const opponentSide = opponent;
          if (this.rallyState.bouncesOnSide[opponentSide] >= 1) {
            this.awardPoint(hitter, `${opponent.toUpperCase()} missed return`);
          } else {
            // Ball sailed out of bounds without landing on opponent side -> opponent scores!
            this.awardPoint(opponent, `${hitter.toUpperCase()} hit ball out of bounds`);
          }
        }
        return;
      }
    }

    // 60Hz Snapshot Broadcast
    this.ticksSinceSnapshot += 1;
    if (this.ticksSinceSnapshot >= SIMULATION.tickRate / SIMULATION.snapshotRate) {
      this.ticksSinceSnapshot = 0;
      this.broadcastSnapshot();
    }
  }

  private broadcastSnapshot() {
    const snapshot: SnapshotData = {
      seq: this.sequence,
      serverTime: Date.now(),
      phase: this.phase,
      score: { ...this.score },
      serverSlot: this.currentServer,
      ball: {
        pos: { ...this.ball.pos },
        velocity: { ...this.ball.velocity }
      },
      p1Paddle: { ...this.p1Paddle },
      p2Paddle: { ...this.p2Paddle },
      countdown: this.countdownRemaining,
      disconnectCountdown: this.disconnectRemaining,
      pausedBy: this.pausedBy,
      winner: this.winner,
      p1Rematch: !!this.p1?.rematch,
      p2Rematch: !!this.p2?.rematch,
      matchStats: {
        longestRally: this.matchStats.longestRally,
        currentRally: this.currentRallyShots,
        p1Smashes: this.matchStats.smashesP1,
        p2Smashes: this.matchStats.smashesP2,
        totalPoints: this.matchStats.totalPoints,
        rallyLengths: [...this.matchStats.rallyLengths],
        maxBallSpeed: this.matchStats.maxBallSpeed,
        smashesP1: this.matchStats.smashesP1,
        smashesP2: this.matchStats.smashesP2,
        acesP1: this.matchStats.acesP1,
        acesP2: this.matchStats.acesP2,
        returnHeatmap: this.matchStats.returnHeatmap.map((row) => [...row])
      }
    };

    this.replayBuffer.push(snapshot);
    if (this.replayBuffer.length > 240) {
      this.replayBuffer.shift();
    }

    this.io.to(this.roomId).emit('s2c_snapshot', snapshot);
  }

  public destroy() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.disconnectInterval) {
      clearInterval(this.disconnectInterval);
      this.disconnectInterval = null;
    }
  }
}
