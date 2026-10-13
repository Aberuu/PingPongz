import type { Server, Socket } from 'socket.io';
import {
  TABLE_DIMENSIONS,
  PADDLE_PHYSICS,
  BALL_PHYSICS,
  SIMULATION,
  MATCH_RULES
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
  RoomStateMsg
} from '../shared/types.js';
import {
  checkMatchWinner,
  determineServer,
  createInitialRallyState,
  type RallyState
} from '../shared/rules.js';
import { stepBallPhysics, clamp } from './physics.js';

interface ConnectedPlayer {
  id: string;
  socket: Socket;
  name: string;
  ready: boolean;
  rematch: boolean;
}

export class GameRoom {
  private io: Server;
  public p1: ConnectedPlayer | null = null;
  public p2: ConnectedPlayer | null = null;

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

  constructor(io: Server) {
    this.io = io;
    this.startSimulationLoop();
  }

  public getRoomState(hostAddress: string): RoomStateMsg {
    return {
      p1Connected: !!this.p1,
      p2Connected: !!this.p2,
      p1Ready: !!this.p1?.ready,
      p2Ready: !!this.p2?.ready,
      p1Name: this.p1?.name || 'Player 1',
      p2Name: this.p2?.name || 'Player 2',
      hostAddress
    };
  }

  public broadcastRoomState(hostAddress: string) {
    this.io.emit('s2c_room_state', this.getRoomState(hostAddress));
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

  public handleRematch(socket: Socket, hostAddress = '') {
    if (this.phase !== 'GAME_OVER') return;

    if (this.p1 && this.p1.id === socket.id) this.p1.rematch = true;
    if (this.p2 && this.p2.id === socket.id) this.p2.rematch = true;

    if (this.p1?.rematch && this.p2?.rematch) {
      // Reset match
      this.score = { p1: 0, p2: 0 };
      // Loser serves first
      this.initialServer = this.winner === 'p1' ? 'p2' : 'p1';
      this.currentServer = this.initialServer;
      this.winner = null;
      this.p1.rematch = false;
      this.p2.rematch = false;
      this.startCountdown();
    }

    this.broadcastRoomState(hostAddress);
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

  private executeServeToss() {
    if (this.phase !== 'SERVING') return;

    this.phase = 'RALLY';
    this.rallyState.isServeRally = true;
    this.rallyState.servePhase = 'MUST_BOUNCE_SERVER_SIDE';
    this.rallyState.lastHitter = this.currentServer;

    const isP1 = this.currentServer === 'p1';
    const serverPaddle = isP1 ? this.p1Paddle : this.p2Paddle;
    const dirZ = isP1 ? -1 : 1;

    // Authentic arcade serve velocity:
    // Aim X calculated from paddle yaw angle (inverted for P2 who faces +Z)
    const aimYaw = isP1 ? serverPaddle.yaw : -serverPaddle.yaw;
    const forwardSpeed = 4.3;
    const vx = Math.sin(aimYaw) * forwardSpeed;
    const vz = dirZ * Math.cos(aimYaw) * forwardSpeed;
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
    if (winner === 'p1') this.score.p1 += 1;
    else this.score.p2 += 1;

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

    const matchWinner = checkMatchWinner(this.score);
    if (matchWinner) {
      this.winner = matchWinner;
      this.phase = 'GAME_OVER';
      this.emitEvent({
        type: 'MATCH_OVER',
        payload: {
          winner: matchWinner,
          score: { ...this.score }
        }
      });
      return;
    }

    // Determine next server
    this.currentServer = determineServer(this.initialServer, this.score);
  }

  private emitEvent(event: GameEventData) {
    this.io.emit('s2c_event', event);
  }

  private startSimulationLoop() {
    this.loopTimer = setInterval(() => {
      this.tick();
    }, 1000 / SIMULATION.tickRate);
  }

  private tick() {
    const dt = SIMULATION.dt;
    this.sequence += 1;

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
          const hitter = event.payload.player;
          const receiver = hitter === 'p1' ? 'p2' : 'p1';

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
      winner: this.winner
    };

    this.io.emit('s2c_snapshot', snapshot);
  }
}
