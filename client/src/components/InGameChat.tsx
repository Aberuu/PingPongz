import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage, PlayerSlot, TypingStatusMsg } from '@shared/types';
import { network } from '../network/socketClient';

interface InGameChatProps {
  localSlot: PlayerSlot;
  p1Name: string;
  p2Name: string;
  isMobile?: boolean;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
}

const QUICK_CHATS = [
  'GG!',
  'Nice shot! 🏓',
  'Oops! 😅',
  'Smash keras! ⚡',
  'Ayo lagi! 🔥'
];

export const InGameChat: React.FC<InGameChatProps> = ({
  localSlot,
  p1Name,
  p2Name,
  isMobile = false,
  isOpen,
  onToggleOpen,
  onInputFocus,
  onInputBlur
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [opponentTyping, setOpponentTyping] = useState(false);
  const [recentFloatingMsgs, setRecentFloatingMsgs] = useState<ChatMessage[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const opponentTypingTimeoutRef = useRef<number | null>(null);

  // Auto-scroll chat log to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
      // Auto-focus input when opened
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, scrollToBottom]);

  // Listen to incoming chat messages
  useEffect(() => {
    const unsubChat = network.onChatMessage((msg: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-49), msg]);

      // If closed, increment unread and show floating bubble
      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
        setRecentFloatingMsgs((prev) => [...prev.slice(-2), msg]);

        // Auto remove floating message after 6 seconds
        window.setTimeout(() => {
          setRecentFloatingMsgs((current) => current.filter((m) => m.id !== msg.id));
        }, 6000);
      }
    });

    const unsubTyping = network.onTypingStatus((status: TypingStatusMsg) => {
      if (status.senderSlot !== localSlot) {
        setOpponentTyping(status.isTyping);
        if (opponentTypingTimeoutRef.current) {
          window.clearTimeout(opponentTypingTimeoutRef.current);
        }
        if (status.isTyping) {
          // Auto clear after 4 seconds if no new typing event
          opponentTypingTimeoutRef.current = window.setTimeout(() => {
            setOpponentTyping(false);
          }, 4000);
        }
      }
    });

    return () => {
      unsubChat();
      unsubTyping();
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      if (opponentTypingTimeoutRef.current) window.clearTimeout(opponentTypingTimeoutRef.current);
    };
  }, [isOpen, localSlot]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, scrollToBottom]);

  // Handle typing status broadcast to opponent
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.trim()) {
      network.sendTypingStatus(true);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        network.sendTypingStatus(false);
      }, 2500);
    } else {
      network.sendTypingStatus(false);
    }
  };

  // Send message
  const handleSendMessage = (textToSend?: string, isQuick = false) => {
    const content = (textToSend ?? inputText).trim();
    if (!content) return;

    network.sendChatMessage(content, isQuick);
    network.sendTypingStatus(false);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);

    if (!textToSend) {
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputText.trim()) {
        handleSendMessage();
      } else {
        // If empty enter, close chat to return to game
        onToggleOpen(false);
        inputRef.current?.blur();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onToggleOpen(false);
      inputRef.current?.blur();
    }
  };

  const opponentName = localSlot === 'p1' ? p2Name : p1Name;

  const getSlotColor = (slot: PlayerSlot | 'system' | 'bot') => {
    if (slot === 'p1') return '#ff5252';
    if (slot === 'p2') return '#448aff';
    if (slot === 'bot') return '#ffb300';
    return '#69f0ae';
  };

  const getSlotBadge = (slot: PlayerSlot | 'system' | 'bot') => {
    if (slot === 'p1') return 'P1';
    if (slot === 'p2') return 'P2';
    if (slot === 'bot') return 'BOT';
    return 'SYS';
  };

  return (
    <div
      className="in-game-chat-root"
      style={{
        position: 'absolute',
        bottom: isMobile ? '70px' : '24px',
        left: isMobile ? '12px' : '20px',
        zIndex: 120,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        maxWidth: isMobile ? 'calc(100vw - 24px)' : '380px'
      }}
    >
      {/* 1. Floating Stream when Chat Box is Closed */}
      {!isOpen && recentFloatingMsgs.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginBottom: '8px',
            pointerEvents: 'none'
          }}
        >
          {recentFloatingMsgs.map((msg) => (
            <div
              key={msg.id}
              className="chat-floating-bubble"
              style={{
                backgroundColor: 'rgba(15, 18, 23, 0.88)',
                border: '2px solid #2e3644',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                padding: '6px 10px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'fadeBubble 0.2s ease-out'
              }}
            >
              <span
                style={{
                  fontSize: '8px',
                  padding: '2px 4px',
                  backgroundColor: getSlotColor(msg.senderSlot),
                  color: '#ffffff',
                  fontWeight: 'bold',
                  borderRadius: '2px'
                }}
              >
                {getSlotBadge(msg.senderSlot)}
              </span>
              <span style={{ color: '#8c96a5', fontSize: '9px' }}>{msg.senderName}:</span>
              <span style={{ color: '#f0f4f8' }}>{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 2. Chat Toggle Button (when closed) */}
      {!isOpen ? (
        <button
          className="pixel-btn"
          onClick={() => {
            onToggleOpen(true);
            onInputFocus?.();
          }}
          style={{
            pointerEvents: 'auto',
            fontSize: '9px',
            padding: '6px 12px',
            backgroundColor: 'rgba(24, 29, 38, 0.85)',
            border: '2px solid #3d495c',
            position: 'relative'
          }}
          title="Buka Chat (Tekan Enter di PC)"
        >
          💬 CHAT {isMobile ? '' : '(ENTER)'}
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                backgroundColor: '#d32f2f',
                color: '#ffffff',
                fontSize: '8px',
                borderRadius: '50%',
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 6px rgba(211, 47, 47, 0.8)'
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      ) : (
        /* 3. Full Expanded Chat Box */
        <div
          className="pixel-card in-game-chat-panel"
          style={{
            pointerEvents: 'auto',
            width: isMobile ? '320px' : '360px',
            maxWidth: '92vw',
            padding: '10px',
            backgroundColor: 'rgba(18, 22, 30, 0.95)',
            border: '3px solid #3d495c',
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '2px solid #28303f',
              paddingBottom: '6px'
            }}
          >
            <div style={{ fontSize: '10px', color: '#ffb300', fontWeight: 'bold' }}>
              OBROLAN (CHAT)
            </div>
            <button
              onClick={() => onToggleOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#8c96a5',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '11px',
                padding: '2px 6px'
              }}
              title="Tutup (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Messages History List */}
          <div
            style={{
              height: isMobile ? '120px' : '150px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              paddingRight: '4px'
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  fontSize: '9px',
                  color: '#556680',
                  textAlign: 'center',
                  marginTop: '40px'
                }}
              >
                Belum ada pesan. Ketik sesuatu di bawah!
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    fontSize: '10px',
                    lineHeight: '1.4',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    wordBreak: 'break-word'
                  }}
                >
                  <span
                    style={{
                      fontSize: '8px',
                      padding: '1px 4px',
                      backgroundColor: getSlotColor(m.senderSlot),
                      color: '#ffffff',
                      fontWeight: 'bold',
                      borderRadius: '2px',
                      flexShrink: 0,
                      marginTop: '1px'
                    }}
                  >
                    {getSlotBadge(m.senderSlot)}
                  </span>
                  <div>
                    <span style={{ color: '#8c96a5', fontSize: '9px', marginRight: '4px' }}>
                      {m.senderName}:
                    </span>
                    <span style={{ color: '#f0f4f8' }}>{m.text}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Opponent Live Typing Indicator */}
          {opponentTyping && (
            <div
              style={{
                fontSize: '8px',
                color: '#ffb300',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                animation: 'pulse 1s infinite alternate'
              }}
            >
              <span>●</span>
              <span>{opponentName} sedang mengetik...</span>
            </div>
          )}

          {/* Quick Chat Reaction Chips */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              overflowX: 'auto',
              paddingBottom: '2px',
              scrollbarWidth: 'none'
            }}
          >
            {QUICK_CHATS.map((preset) => (
              <button
                key={preset}
                className="pixel-btn"
                onClick={() => handleSendMessage(preset, true)}
                style={{
                  fontSize: '8px',
                  padding: '4px 6px',
                  whiteSpace: 'nowrap',
                  backgroundColor: '#202734',
                  borderColor: '#3b4659'
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Custom Text Typing Input Form */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              className="pixel-input"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              placeholder="Ketik pesan bebas..."
              maxLength={120}
              style={{
                flex: 1,
                fontSize: '10px',
                padding: '6px 8px',
                height: '32px'
              }}
            />
            <button
              className="pixel-btn btn-primary"
              onClick={() => handleSendMessage()}
              style={{
                fontSize: '9px',
                padding: '6px 10px',
                height: '32px'
              }}
            >
              KIRIM
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
