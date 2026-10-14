import type { Server, Socket } from 'socket.io';
import { GameRoom } from './gameRoom.js';

export class RoomManager {
  private io: Server;
  public rooms: Map<string, GameRoom> = new Map();
  public socketToRoom: Map<string, string> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
    this.startCleanupTimer();
  }

  // Generates clean 5-character alphanumeric room codes like 'VX88', 'PONG9', 'ACE72'
  public generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 5; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(id));
    return id;
  }

  public getOrCreateRoom(roomId?: string): GameRoom {
    const cleanId = (roomId || '').trim().toUpperCase();
    if (cleanId && this.rooms.has(cleanId)) {
      return this.rooms.get(cleanId)!;
    }

    const newId = cleanId || this.generateRoomId();
    const newRoom = new GameRoom(this.io, newId);
    this.rooms.set(newId, newRoom);
    return newRoom;
  }

  public getRoom(roomId?: string): GameRoom | undefined {
    if (!roomId) return undefined;
    return this.rooms.get(roomId.trim().toUpperCase());
  }

  public getRoomForSocket(socket: Socket): GameRoom | undefined {
    const roomId = this.socketToRoom.get(socket.id);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  public joinSocketToRoom(socket: Socket, room: GameRoom) {
    const oldRoomId = this.socketToRoom.get(socket.id);
    if (oldRoomId && oldRoomId !== room.roomId) {
      socket.leave(oldRoomId);
      const oldRoom = this.rooms.get(oldRoomId);
      if (oldRoom) {
        oldRoom.handleDisconnect(socket);
      }
    }

    this.socketToRoom.set(socket.id, room.roomId);
    socket.join(room.roomId);
  }

  public leaveRoom(socket: Socket) {
    const roomId = this.socketToRoom.get(socket.id);
    if (roomId) {
      socket.leave(roomId);
      this.socketToRoom.delete(socket.id);
      const room = this.rooms.get(roomId);
      if (room) {
        room.handleDisconnect(socket);
      }
    }
  }

  // Find an open room waiting for P2 or create new one
  public findQuickMatch(): GameRoom {
    for (const [_, room] of this.rooms) {
      if (room.gameMode === 'match' && room.phase === 'LOBBY' && room.p1 && !room.p2) {
        return room;
      }
    }
    return this.getOrCreateRoom();
  }

  private startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      for (const [roomId, room] of this.rooms) {
        const p1Active = Boolean(room.p1?.socket?.connected);
        const p2Active = Boolean(room.p2?.socket?.connected);

        // If both disconnected and not solo bot match currently active
        if (!p1Active && !p2Active && room.gameMode !== 'bot') {
          room.destroy();
          this.rooms.delete(roomId);
        }
      }
    }, 45000);
  }

  public destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const [_, room] of this.rooms) {
      room.destroy();
    }
    this.rooms.clear();
    this.socketToRoom.clear();
  }
}
