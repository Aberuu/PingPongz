import { describe, it, expect, vi } from 'vitest';
import { GameRoom } from '../server/gameRoom.js';
import type { ChatMessage, TypingStatusMsg } from '../shared/types.js';

describe('In-Game Live Chat & Free-Text Typing System', () => {
  it('broadcasts validated chat messages with sender slot and name', () => {
    let emittedEvent = '';
    let emittedData: ChatMessage | null = null;

    const mockIo: any = {
      emit: (evt: string, data: any) => {
        emittedEvent = evt;
        emittedData = data;
      }
    };

    const room = new GameRoom(mockIo);

    // Setup mock player 1
    const mockSocketP1: any = { id: 'socket-p1' };
    room.p1 = {
      id: 'socket-p1',
      socket: mockSocketP1,
      name: 'Budi Santoso',
      ready: true,
      rematch: false
    };

    // P1 sends a text message
    room.handleChatMessage(mockSocketP1, {
      text: '  Halo bro! Main santai ya  ',
      isQuickChat: false
    });

    expect(emittedEvent).toBe('s2c_chat_message');
    expect(emittedData).not.toBeNull();
    expect(emittedData?.senderSlot).toBe('p1');
    expect(emittedData?.senderName).toBe('Budi Santoso');
    expect(emittedData?.text).toBe('Halo bro! Main santai ya');
    expect(emittedData?.isQuickChat).toBe(false);
    expect(typeof emittedData?.timestamp).toBe('number');
  });

  it('rejects empty or whitespace-only messages', () => {
    const mockIo: any = {
      emit: vi.fn()
    };

    const room = new GameRoom(mockIo);
    const mockSocketP1: any = { id: 'socket-p1' };
    room.p1 = {
      id: 'socket-p1',
      socket: mockSocketP1,
      name: 'Pemain 1',
      ready: true,
      rematch: false
    };

    room.handleChatMessage(mockSocketP1, { text: '   ' });
    expect(mockIo.emit).not.toHaveBeenCalled();

    room.handleChatMessage(mockSocketP1, { text: '' });
    expect(mockIo.emit).not.toHaveBeenCalled();
  });

  it('enforces maximum 120 character limit per message', () => {
    let capturedMsg: ChatMessage | null = null;
    const mockIo: any = {
      emit: (_evt: string, data: any) => {
        capturedMsg = data;
      }
    };

    const room = new GameRoom(mockIo);
    const mockSocketP1: any = { id: 'socket-p1' };
    room.p1 = {
      id: 'socket-p1',
      socket: mockSocketP1,
      name: 'P1',
      ready: true,
      rematch: false
    };

    const longMessage = 'A'.repeat(200);
    room.handleChatMessage(mockSocketP1, { text: longMessage });

    expect(capturedMsg).not.toBeNull();
    expect(capturedMsg?.text.length).toBe(120);
    expect(capturedMsg?.text).toBe('A'.repeat(120));
  });

  it('broadcasts typing status to opponent player socket', () => {
    let broadcastEvt = '';
    let broadcastData: TypingStatusMsg | null = null;

    const mockBroadcast: any = {
      emit: (evt: string, data: any) => {
        broadcastEvt = evt;
        broadcastData = data;
      }
    };

    const mockSocketP2: any = {
      id: 'socket-p2',
      broadcast: mockBroadcast
    };

    const mockIo: any = { emit: () => {} };
    const room = new GameRoom(mockIo);
    room.p2 = {
      id: 'socket-p2',
      socket: mockSocketP2,
      name: 'Dewi',
      ready: true,
      rematch: false
    };

    room.handleTypingStatus(mockSocketP2, true);

    expect(broadcastEvt).toBe('s2c_typing');
    expect(broadcastData).not.toBeNull();
    expect(broadcastData?.senderSlot).toBe('p2');
    expect(broadcastData?.isTyping).toBe(true);

    // Stop typing
    room.handleTypingStatus(mockSocketP2, false);
    expect(broadcastData?.isTyping).toBe(false);
  });
});
