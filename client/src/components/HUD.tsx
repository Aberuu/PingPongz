import React, { useState, useEffect } from 'react';
import type { ScoreState, PlayerSlot, GamePhase, GameMode, PracticeZone } from '@shared/types';

interface HUDProps {
  score: ScoreState;
  serverSlot: PlayerSlot;
  localSlot: PlayerSlot;
  phase: GamePhase;
  countdown: number;
  disconnectCountdown: number;
  smashCooldownRatio: number; // 0 = ready, 1 = max cooldown
  ping: number;
  fps: number;
  p1Name: string;
  p2Name: string;
  isPointerLocked: boolean;
  onLockClick: () => void;
  onSettingsClick: () => void;
  onQuitToLobby?: () => void;
  gameMode?: GameMode;
  practiceZone?: PracticeZone;
  onSelectPracticeZone?: (zone: PracticeZone) => void;
}

export const HUD: React.FC<HUDProps> = ({
  score,
  serverSlot,
  localSlot,
  phase,
  countdown,
  disconnectCountdown,
  smashCooldownRatio,
  ping,
  fps,
  p1Name,
  p2Name,
  isPointerLocked,
  onLockClick,
  onSettingsClick,
  onQuitToLobby,
  gameMode,
  practiceZone,
  onSelectPracticeZone
}) => {
  // F3 toggle for Ping/FPS stats (hidden by default per user guidelines)
  const [showStats, setShowStats] = useState(false);

  // Esc hint visibility (fades after 5 seconds)
  const [showEscHint, setShowEscHint] = useState(true);

  // Service prompt auto-fade
  const [servePromptVisible, setServePromptVisible] = useState(true);

  // Contextual onboarding hints
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setShowStats((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fade Esc hint after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEscHint(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Manage service prompt timer
  useEffect(() => {
    if (phase === 'SERVING' && serverSlot === localSlot) {
      setServePromptVisible(true);
      const timer = setTimeout(() => {
        setServePromptVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setServePromptVisible(false);
    }
  }, [phase, serverSlot, localSlot]);

  // Track tutorial progression
  useEffect(() => {
    const handleMouseMove = () => {
      if (tutorialStep === 0) setTutorialStep(1);
    };
    window.addEventListener('mousemove', handleMouseMove, { once: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [tutorialStep]);

  const isMyServe = phase === 'SERVING' && serverSlot === localSlot;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 20px',
        zIndex: 20
      }}
    >
      {/* Top Header: Scoreboard & Optional F3 Debug Stats */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          width: '100%'
        }}
      >
        {/* Connection & Debug Panel (Top-Left, toggled by F3) */}
        {showStats ? (
          <div
            style={{
              backgroundColor: 'rgba(15, 18, 23, 0.88)',
              border: '2px solid #2e3644',
              padding: '6px 10px',
              fontSize: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: '#8c96a5' }}>PING:</span>
              <span style={{ color: ping < 40 ? '#4caf50' : '#ff9800' }}>{ping} ms</span>
              <span style={{ color: '#8c96a5', marginLeft: '6px' }}>FPS:</span>
              <span style={{ color: '#4caf50' }}>{fps}</span>
            </div>
            <div style={{ fontSize: '9px', color: '#ffb300' }}>
              ANDA: {localSlot === 'p1' ? 'P1 (MERAH)' : 'P2 (BIRU)'} (Tekan F3 untuk sembunyikan)
            </div>
          </div>
        ) : (
          <div style={{ width: '80px' }} />
        )}

        {/* Top-Center Header: Scoreboard OR Practice Mode Drill Bar */}
        {gameMode === 'practice' ? (
          <div
            style={{
              backgroundColor: 'rgba(18, 22, 30, 0.92)',
              border: '3px solid #2c3342',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              padding: '6px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ fontSize: '11px', color: '#ffb300', fontWeight: 'bold' }}>
              MODE LATIHAN (BALL MACHINE)
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '9px', color: '#8c96a5' }}>ZONA UMPAN:</span>
              {(['center', 'left', 'right', 'random'] as PracticeZone[]).map((z) => (
                <button
                  key={z}
                  className={`pixel-btn ${(practiceZone ?? 'random') === z ? 'btn-primary' : ''}`}
                  onClick={() => onSelectPracticeZone?.(z)}
                  style={{ fontSize: '8px', padding: '4px 8px' }}
                >
                  {z === 'center' ? 'Tengah' : z === 'left' ? 'Kiri' : z === 'right' ? 'Kanan' : 'Acak'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: 'rgba(18, 22, 30, 0.92)',
              border: '3px solid #2c3342',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              padding: '8px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}
          >
            {/* Player 1 Block */}
            <div style={{ textAlign: 'center', minWidth: '70px' }}>
              <div
                style={{
                  fontSize: '10px',
                  color: '#d32f2f',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  justifyContent: 'center'
                }}
              >
                {p1Name}
                {serverSlot === 'p1' && (
                  <span title="Giliran Servis" style={{ color: '#ffb300', fontSize: '10px' }}>
                    ●
                  </span>
                )}
              </div>
              <div style={{ fontSize: '26px', color: '#f0f4f8', lineHeight: 1 }}>{score.p1}</div>
            </div>

            {/* VS Divider */}
            <div style={{ fontSize: '14px', color: '#556680' }}>:</div>

            {/* Player 2 Block */}
            <div style={{ textAlign: 'center', minWidth: '70px' }}>
              <div
                style={{
                  fontSize: '10px',
                  color: '#1976d2',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  justifyContent: 'center'
                }}
              >
                {p2Name}
                {serverSlot === 'p2' && (
                  <span title="Giliran Servis" style={{ color: '#ffb300', fontSize: '10px' }}>
                    ●
                  </span>
                )}
              </div>
              <div style={{ fontSize: '26px', color: '#f0f4f8', lineHeight: 1 }}>{score.p2}</div>
            </div>
          </div>
        )}

        {/* Top-Right Action Buttons */}
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: '8px' }}>
          {onQuitToLobby && (
            <button
              className="pixel-btn"
              onClick={onQuitToLobby}
              style={{ fontSize: '10px', padding: '8px 12px', color: '#ffb300' }}
              title="Kembali ke Menu Utama / Lobi"
            >
              LOBI
            </button>
          )}
          <button
            className="pixel-btn"
            onClick={onSettingsClick}
            style={{ fontSize: '10px', padding: '8px 12px' }}
            title="Pengaturan Game"
          >
            PENGATURAN
          </button>
        </div>
      </div>

      {/* Middle Alerts (Countdown & Disconnect only; NO big center box covering the table!) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px'
        }}
      >
        {phase === 'COUNTDOWN' && (
          <div
            style={{
              backgroundColor: 'rgba(15, 18, 23, 0.9)',
              border: '4px solid #ffb300',
              padding: '16px 36px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '14px', color: '#8c96a5', marginBottom: '8px' }}>
              BERSIAP-SIAP
            </div>
            <div style={{ fontSize: '42px', color: '#ffb300' }}>{countdown}</div>
          </div>
        )}

        {phase === 'DISCONNECTED_PAUSE' && (
          <div
            style={{
              backgroundColor: 'rgba(40, 10, 10, 0.95)',
              border: '4px solid #d32f2f',
              padding: '18px 28px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '13px', color: '#ff7a00', marginBottom: '8px' }}>
              KONEKSI LAWAN TERPUTUS
            </div>
            <div style={{ fontSize: '11px', color: '#f0f4f8' }}>
              Menunggu rekoneksi: {disconnectCountdown} detik
            </div>
          </div>
        )}

        {!isPointerLocked && phase !== 'LOBBY' && phase !== 'GAME_OVER' && (
          <div style={{ pointerEvents: 'auto', marginTop: '12px' }}>
            <button
              className="pixel-btn btn-primary"
              onClick={onLockClick}
              style={{ padding: '14px 28px', fontSize: '13px' }}
            >
              KLIK DI SINI UNTUK KONTROL MOUSE
            </button>
          </div>
        )}
      </div>

      {/* Bottom Area: Contextual Hints, Non-Intrusive Serve Prompt, and Conditional Smash Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          width: '100%'
        }}
      >
        {/* Clean Service Prompt (Moved to bottom center, small pill, auto-fading) */}
        {isMyServe && servePromptVisible && (
          <div
            style={{
              backgroundColor: 'rgba(21, 65, 30, 0.92)',
              border: '2px solid #4caf50',
              padding: '8px 18px',
              fontSize: '11px',
              color: '#ffffff',
              borderRadius: '3px',
              boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            GILIRAN ANDA: GESER BOLA (MOUSE / A & D) | KLIK KIRI UNTUK SERVIS
          </div>
        )}

        {/* Tutorial Hint for New Players */}
        {tutorialStep === 0 && isPointerLocked && (
          <div
            style={{
              backgroundColor: 'rgba(18, 24, 38, 0.85)',
              border: '1px solid #3b82f6',
              padding: '6px 14px',
              fontSize: '10px',
              color: '#93c5fd'
            }}
          >
            PETUNJUK: Gerakkan mouse untuk menggeser posisi raket
          </div>
        )}

        {/* Bottom Bar: Smash Gauge (Only shown during cooldown/holding) & Esc Hint */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            width: '100%'
          }}
        >
          {/* Smash Meter (Only rendered when on cooldown to keep screen uncluttered) */}
          <div style={{ minWidth: '150px' }}>
            {smashCooldownRatio > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(15, 18, 23, 0.85)',
                  border: '2px solid #2e3644',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ fontSize: '9px', color: '#8c96a5' }}>SMASH (PENDINGINAN)</div>
                <div
                  style={{
                    width: '120px',
                    height: '8px',
                    backgroundColor: '#0d1015',
                    border: '1px solid #3d495c',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((1 - smashCooldownRatio) * 100)}%`,
                      height: '100%',
                      backgroundColor: '#ff7a00',
                      transition: 'width 0.05s linear'
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Esc Pause Hint (Only shown if unlocked or during initial 5 seconds) */}
          {(showEscHint || !isPointerLocked) && (
            <div
              style={{
                backgroundColor: 'rgba(15, 18, 23, 0.75)',
                padding: '6px 12px',
                fontSize: '9px',
                color: '#8c96a5'
              }}
            >
              ESC: Jeda / Lepas Kursor (F3: Info Ping)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
