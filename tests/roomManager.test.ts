import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomManager } from '../server/roomManager.js';
import type { Server, Socket } from 'socket.io';

describe('RoomManager Multi-Room Isolation', () => {
  const mockIo = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  } as unknown as Server;

  let manager: RoomManager;

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
  });

  it('generates 5-character alphanumeric codes without ambiguous characters', () => {
    manager = new RoomManager(mockIo);
    const code = manager.generateRoomId();
    expect(code).toHaveLength(5);
    // Excluded chars: 0, O, 1, I
    expect(code).not.toMatch(/[0O1I]/);
  });

  it('creates and retrieves rooms case-insensitively', () => {
    manager = new RoomManager(mockIo);
    const room = manager.getOrCreateRoom('room1');
    expect(room.roomId).toBe('ROOM1');
    expect(manager.getRoom('ROOM1')).toBe(room);
    expect(manager.getRoom('room1')).toBe(room);
  });

  it('tracks socket to room mapping and handles room transfers', () => {
    manager = new RoomManager(mockIo);
    const mockSocket = {
      id: 'sock-123',
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn()
    } as unknown as Socket;

    const roomA = manager.getOrCreateRoom('ROOMA');
    manager.joinSocketToRoom(mockSocket, roomA);
    expect(manager.getRoomForSocket(mockSocket)?.roomId).toBe('ROOMA');
    expect(mockSocket.join).toHaveBeenCalledWith('ROOMA');

    // Transfer socket to room B
    const roomB = manager.getOrCreateRoom('ROOMB');
    manager.joinSocketToRoom(mockSocket, roomB);
    expect(manager.getRoomForSocket(mockSocket)?.roomId).toBe('ROOMB');
    expect(mockSocket.leave).toHaveBeenCalledWith('ROOMA');
    expect(mockSocket.join).toHaveBeenCalledWith('ROOMB');
  });

  it('handles quick match pairing for open rooms', () => {
    manager = new RoomManager(mockIo);
    const roomHost = manager.getOrCreateRoom('MATCH1');
    roomHost.gameMode = 'match';
    roomHost.p1 = { id: 'host-sock', socket: null, name: 'Host Player', ready: false, rematch: false };
    roomHost.p2 = null;

    const matched = manager.findQuickMatch();
    expect(matched.roomId).toBe('MATCH1');
  });

  it('cleans up all rooms on destroy', () => {
    manager = new RoomManager(mockIo);
    manager.getOrCreateRoom('TEST1');
    manager.getOrCreateRoom('TEST2');
    expect(manager.rooms.size).toBe(2);

    manager.destroy();
    expect(manager.rooms.size).toBe(0);
    expect(manager.socketToRoom.size).toBe(0);
  });
});
