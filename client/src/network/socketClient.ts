import { io, Socket } from 'socket.io-client';
import type {
  SnapshotData,
  GameEventData,
  RoomStateMsg,
  ClientInputMsg,
  PlayerSlot,
  GameMode,
  BotDifficulty,
  PracticeZone,
  ChatMessage,
  TypingStatusMsg
} from '@shared/types';
import { soundFx } from '../audio/synth';

type SnapshotListener = (snapshot: SnapshotData) => void;
type EventListener = (event: GameEventData) => void;
type RoomStateListener = (state: RoomStateMsg) => void;
type SlotListener = (slot: PlayerSlot) => void;
type ChatListener = (message: ChatMessage) => void;
type TypingListener = (status: TypingStatusMsg) => void;

class SocketClient {
  private socket: Socket | null = null;
  public ping = 0;
  public assignedSlot: PlayerSlot = 'p1';
  public latestSnapshot: SnapshotData | null = null;

  private snapshotListeners: Set<SnapshotListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private roomStateListeners: Set<RoomStateListener> = new Set();
  private slotListeners: Set<SlotListener> = new Set();
  private chatListeners: Set<ChatListener> = new Set();
  private typingListeners: Set<TypingListener> = new Set();
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

    this.socket.on('s2c_chat_message', (msg: ChatMessage) => {
      soundFx.playChatBeep();
      this.chatListeners.forEach((cb) => cb(msg));
    });

    this.socket.on('s2c_typing', (status: TypingStatusMsg) => {
      this.typingListeners.forEach((cb) => cb(status));
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
        if (event.payload?.isSweetSpot) {
          soundFx.playSweetSpot();
        } else if (event.payload?.isSlice) {
          soundFx.playSliceChop();
        } else {
          soundFx.playPaddleHit(event.payload?.isSmash);
        }
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
      case 'RULE_ANNOUNCEMENT':
        if (event.payload?.announcement) {
          soundFx.playAnnouncementSound(event.payload.announcement.type);
        }
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

  public joinRoom(playerName: string, preferredSlot?: PlayerSlot, roomId?: string) {
    this.socket?.emit('c2s_join_room', { playerName, slot: preferredSlot, roomId });
  }

  public createRoom(playerName: string, gameMode?: GameMode) {
    this.socket?.emit('c2s_create_room', { playerName, gameMode });
  }

  public quickMatch(playerName: string) {
    this.socket?.emit('c2s_quick_match', { playerName });
  }

  public setReady(ready: boolean) {
    this.socket?.emit('c2s_ready', { ready });
  }

  public setGameMode(mode: GameMode, botDifficulty?: BotDifficulty, practiceZone?: PracticeZone) {
    this.socket?.emit('c2s_set_mode', { mode, botDifficulty, practiceZone });
  }

  public setPracticeZone(zone: PracticeZone) {
    this.socket?.emit('c2s_set_practice_zone', { zone });
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
    this.socket?.emit('c2s_rematch', { slot: this.assignedSlot });
  }

  public sendQuitToLobby() {
    this.socket?.emit('c2s_quit_to_lobby');
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

  public sendChatMessage(text: string, isQuickChat = false) {
    const clean = text.trim();
    if (!clean) return;
    this.socket?.emit('c2s_chat_message', { text: clean, isQuickChat });
  }

  public sendTypingStatus(isTyping: boolean) {
    this.socket?.emit('c2s_typing', { isTyping });
  }

  public onChatMessage(cb: ChatListener) {
    this.chatListeners.add(cb);
    return () => this.chatListeners.delete(cb);
  }

  public onTypingStatus(cb: TypingListener) {
    this.typingListeners.add(cb);
    return () => this.typingListeners.delete(cb);
  }
}

export const network = new SocketClient();
