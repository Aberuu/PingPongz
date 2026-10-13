import { io, Socket } from 'socket.io-client';
import type {
  SnapshotData,
  GameEventData,
  RoomStateMsg,
  ClientInputMsg,
  PlayerSlot
} from '@shared/types';
import { soundFx } from '../audio/synth';

type SnapshotListener = (snapshot: SnapshotData) => void;
type EventListener = (event: GameEventData) => void;
type RoomStateListener = (state: RoomStateMsg) => void;
type SlotListener = (slot: PlayerSlot) => void;

class SocketClient {
  private socket: Socket | null = null;
  public ping = 0;
  public assignedSlot: PlayerSlot = 'p1';
  public latestSnapshot: SnapshotData | null = null;

  private snapshotListeners: Set<SnapshotListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private roomStateListeners: Set<RoomStateListener> = new Set();
  private slotListeners: Set<SlotListener> = new Set();
  private pingInterval: number | null = null;

  public connect(customServerUrl?: string) {
    if (this.socket) {
      this.socket.disconnect();
    }

    // Default to origin or specified host
    const url = customServerUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

    this.socket = io(url, {
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      this.startPingLoop();
    });

    this.socket.on('s2c_assigned_slot', (data: { slot: PlayerSlot }) => {
      this.assignedSlot = data.slot;
      this.slotListeners.forEach((cb) => cb(data.slot));
    });

    this.socket.on('s2c_room_state', (state: RoomStateMsg) => {
      this.roomStateListeners.forEach((cb) => cb(state));
    });

    this.socket.on('s2c_snapshot', (snapshot: SnapshotData) => {
      this.latestSnapshot = snapshot;
      this.snapshotListeners.forEach((cb) => cb(snapshot));
    });

    this.socket.on('s2c_event', (event: GameEventData) => {
      this.handleGameAudio(event);
      this.eventListeners.forEach((cb) => cb(event));
    });

    this.socket.on('s2c_pong', (data: { clientTime: number; serverTime: number }) => {
      const now = Date.now();
      const rtt = now - data.clientTime;
      this.ping = Math.round(rtt / 2);
    });

    this.socket.on('disconnect', () => {
      if (this.pingInterval) {
        window.clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    });
  }

  private handleGameAudio(event: GameEventData) {
    switch (event.type) {
      case 'TABLE_BOUNCE':
        soundFx.playTableBounce();
        break;
      case 'PADDLE_HIT':
        soundFx.playPaddleHit(event.payload?.isSmash);
        break;
      case 'NET_HIT':
        soundFx.playNetHit();
        break;
      case 'POINT':
        soundFx.playPointScored();
        break;
      case 'MATCH_OVER':
        soundFx.playVictoryJingle();
        break;
    }
  }

  private startPingLoop() {
    if (this.pingInterval) window.clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('c2s_ping', { clientTime: Date.now() });
      }
    }, 1000);
  }

  public joinRoom(playerName: string, preferredSlot?: PlayerSlot) {
    this.socket?.emit('c2s_join_room', { playerName, slot: preferredSlot });
  }

  public setReady(ready: boolean) {
    this.socket?.emit('c2s_ready', { ready });
  }

  public sendInput(input: ClientInputMsg) {
    // Send volatile input
    this.socket?.emit('c2s_input', input);
  }

  public sendServeAction() {
    this.socket?.emit('c2s_serve_action');
  }

  public sendPauseToggle() {
    this.socket?.emit('c2s_pause_toggle');
  }

  public sendRematch() {
    this.socket?.emit('c2s_rematch');
  }

  public onSnapshot(cb: SnapshotListener) {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }

  public onEvent(cb: EventListener) {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  public onRoomState(cb: RoomStateListener) {
    this.roomStateListeners.add(cb);
    return () => this.roomStateListeners.delete(cb);
  }

  public onSlotAssigned(cb: SlotListener) {
    this.slotListeners.add(cb);
    return () => this.slotListeners.delete(cb);
  }
}

export const network = new SocketClient();
