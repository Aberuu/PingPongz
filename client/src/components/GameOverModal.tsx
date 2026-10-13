import React, { useState, useEffect } from 'react';
import type { ScoreState, PlayerSlot, MatchStats, GameMode } from '@shared/types';

interface GameOverModalProps {
  score: ScoreState;
  winner: PlayerSlot | null;
  p1Name: string;
  p2Name: string;
  localSlot: PlayerSlot;
  matchStats?: MatchStats;
  p1Rematch?: boolean;
  p2Rematch?: boolean;
  gameMode?: GameMode;
  onRematch: () => void;
  onQuitToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  winner,
  p1Name,
  p2Name,
  localSlot,
  matchStats,
  p1Rematch,
  p2Rematch,
  gameMode,
  onRematch,
  onQuitToLobby
}) => {
  const isWinner = winner === localSlot;
  const winnerName = winner === 'p1' ? p1Name : p2Name;

  const isP2AiOrMachine = gameMode === 'bot' || gameMode === 'practice';
  const [localReadyOverride, setLocalReadyOverride] = useState<boolean | null>(null);

  useEffect(() => {
    setLocalReadyOverride(null);
  }, [p1Rematch, p2Rematch]);

  const rawLocalReady = localSlot === 'p1' ? !!p1Rematch : (isP2AiOrMachine ? true : !!p2Rematch);
  const isLocalReady = localReadyOverride !== null ? localReadyOverride : rawLocalReady;

  const isP1Ready = localSlot === 'p1' ? isLocalReady : !!p1Rematch;
  const isP2Ready = isP2AiOrMachine ? true : (localSlot === 'p2' ? isLocalReady : !!p2Rematch);
  const isOpponentReady = localSlot === 'p1' ? isP2Ready : isP1Ready;
  const bothReady = isP1Ready && isP2Ready;

  const handleRematchClick = () => {
    const next = !isLocalReady;
    setLocalReadyOverride(next);
    onRematch();
  };

  // Heatmap calculation
  const heatmap = matchStats?.returnHeatmap || [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const maxHits = Math.max(1, ...heatmap.flat());
  const longestRally = matchStats?.rallyLengths.length
    ? Math.max(0, ...matchStats.rallyLengths)
    : 0;

  return (
    <div className="modal-overlay">
      <div
        className="pixel-card"
        style={{
          width: '540px',
          maxWidth: '92%',
          maxHeight: '90vh',
          overflowY: 'auto',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            fontSize: '24px',
            color: isWinner ? '#4caf50' : '#e53935',
            marginBottom: '8px'
          }}
        >
          {isWinner ? 'KEMENANGAN!' : 'KEKALAHAN'}
        </div>

        <div style={{ fontSize: '13px', color: '#ffb300', marginBottom: '16px' }}>
          {winnerName} MEMENANGKAN PERTANDINGAN
        </div>

        {/* Final Score Board */}
        <div
          style={{
            backgroundColor: '#10131a',
            border: '3px solid #2e3644',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '16px'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#d32f2f', marginBottom: '4px' }}>{p1Name}</div>
            <div style={{ fontSize: '30px', color: '#f0f4f8' }}>{score.p1}</div>
          </div>
          <div style={{ fontSize: '18px', color: '#556680' }}>:</div>
          <div>
            <div style={{ fontSize: '11px', color: '#1976d2', marginBottom: '4px' }}>{p2Name}</div>
            <div style={{ fontSize: '30px', color: '#f0f4f8' }}>{score.p2}</div>
          </div>
        </div>

        {/* Status Kesiapan Pemain (Ready Indicator) */}
        <div
          style={{
            backgroundColor: '#0d1117',
            border: '2px solid #2e3644',
            padding: '12px',
            marginBottom: '16px'
          }}
        >
          <div
            style={{
              fontSize: '10px',
              color: '#8c96a5',
              letterSpacing: '1px',
              marginBottom: '10px',
              fontWeight: 'bold'
            }}
          >
            STATUS KESIAPAN TANDING ULANG
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '10px'
            }}
          >
            {/* Player 1 Card */}
            <div
              style={{
                backgroundColor: isP1Ready ? 'rgba(76, 175, 80, 0.15)' : '#161b22',
                border: isP1Ready ? '2px solid #4caf50' : '2px solid #2e3644',
                padding: '8px',
                borderRadius: '2px',
                transition: 'all 0.2s ease'
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#d32f2f',
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {p1Name} {localSlot === 'p1' && '(ANDA)'}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: isP1Ready ? '#4caf50' : '#8c96a5'
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isP1Ready ? '#4caf50' : '#455060',
                    boxShadow: isP1Ready ? '0 0 8px #4caf50' : 'none',
                    display: 'inline-block'
                  }}
                />
                {isP1Ready ? 'SIAP' : 'MENUNGGU'}
              </div>
            </div>

            {/* Player 2 Card */}
            <div
              style={{
                backgroundColor: isP2Ready ? 'rgba(76, 175, 80, 0.15)' : '#161b22',
                border: isP2Ready ? '2px solid #4caf50' : '2px solid #2e3644',
                padding: '8px',
                borderRadius: '2px',
                transition: 'all 0.2s ease'
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#1976d2',
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {p2Name} {localSlot === 'p2' && '(ANDA)'}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: isP2Ready ? '#4caf50' : '#8c96a5'
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isP2Ready ? '#4caf50' : '#455060',
                    boxShadow: isP2Ready ? '0 0 8px #4caf50' : 'none',
                    display: 'inline-block'
                  }}
                />
                {isP2AiOrMachine ? 'SIAP OTOMATIS' : (isP2Ready ? 'SIAP' : 'MENUNGGU')}
              </div>
            </div>
          </div>

          {/* Banner Notice */}
          <div
            style={{
              fontSize: '10px',
              padding: '6px 8px',
              borderRadius: '2px',
              backgroundColor: bothReady
                ? 'rgba(76, 175, 80, 0.2)'
                : isOpponentReady && !isLocalReady
                ? 'rgba(255, 179, 0, 0.2)'
                : isLocalReady
                ? 'rgba(33, 150, 243, 0.2)'
                : 'rgba(255, 255, 255, 0.05)',
              color: bothReady
                ? '#4caf50'
                : isOpponentReady && !isLocalReady
                ? '#ffb300'
                : isLocalReady
                ? '#64b5f6'
                : '#8c96a5',
              fontWeight: 'bold',
              border: `1px solid ${
                bothReady
                  ? '#4caf50'
                  : isOpponentReady && !isLocalReady
                  ? '#ffb300'
                  : isLocalReady
                  ? '#2196f3'
                  : '#2e3644'
              }`
            }}
          >
            {bothReady
              ? 'SEMUA PEMAIN SIAP! MEMULAI PERTANDINGAN...'
              : isOpponentReady && !isLocalReady
              ? 'LAWAN SUDAH SIAP! KLIK TOMBOL UNTUK MEMULAI'
              : isLocalReady
              ? 'MENUNGGU KONFIRMASI DARI LAWAN...'
              : 'KLIK MAIN LAGI UNTUK MENANDAI ANDA SIAP'}
          </div>
        </div>

        {/* Post-Match Statistics */}
        {matchStats && (
          <div
            style={{
              backgroundColor: '#10131a',
              border: '2px solid #2e3644',
              padding: '12px',
              marginBottom: '16px',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#ffb300',
                marginBottom: '8px',
                textAlign: 'center',
                letterSpacing: '1px'
              }}
            >
              STATISTIK PERTANDINGAN & HEATMAP DISTRIBUSI MEJA
            </div>

            {/* Quick Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                fontSize: '9px',
                color: '#8c96a5',
                marginBottom: '12px'
              }}
            >
              <div style={{ backgroundColor: '#181d26', padding: '6px 8px' }}>
                KECEPATAN BOLA MAKS:{' '}
                <span style={{ color: '#ff7a00', fontWeight: 'bold' }}>
                  {(matchStats.maxBallSpeed || 0).toFixed(1)} m/s
                </span>
              </div>
              <div style={{ backgroundColor: '#181d26', padding: '6px 8px' }}>
                RELI TERPANJANG:{' '}
                <span style={{ color: '#4caf50', fontWeight: 'bold' }}>
                  {longestRally} pukulan
                </span>
              </div>
              <div style={{ backgroundColor: '#181d26', padding: '6px 8px' }}>
                SMASH P1 / P2:{' '}
                <span style={{ color: '#f0f4f8', fontWeight: 'bold' }}>
                  {matchStats.smashesP1} / {matchStats.smashesP2}
                </span>
              </div>
              <div style={{ backgroundColor: '#181d26', padding: '6px 8px' }}>
                ACE P1 / P2:{' '}
                <span style={{ color: '#f0f4f8', fontWeight: 'bold' }}>
                  {matchStats.acesP1} / {matchStats.acesP2}
                </span>
              </div>
            </div>

            {/* 5x3 Table Heatmap Grid */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '8px', color: '#687385', marginBottom: '4px' }}>
                DISTRIBUSI PANTULAN BOLA DI MEJA LAWAN (5 KEDALAMAN x 3 ZONA)
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: 'repeat(5, 20px)',
                  gap: '2px',
                  backgroundColor: '#0a0d12',
                  padding: '4px',
                  border: '1px solid #2e3644',
                  maxWidth: '220px',
                  margin: '0 auto'
                }}
              >
                {heatmap.map((row, rIdx) => (
                  <div
                    key={rIdx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '2px'
                    }}
                  >
                    {row.map((val, cIdx) => {
                      const ratio = val / maxHits;
                      const bg =
                        val === 0
                          ? '#141820'
                          : `rgba(255, 122, 0, ${0.25 + 0.75 * ratio})`;
                      return (
                        <div
                          key={cIdx}
                          title={`Row ${rIdx + 1}, Col ${cIdx + 1}: ${val} pantulan`}
                          style={{
                            backgroundColor: bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            color: val > 0 ? '#ffffff' : '#455060'
                          }}
                        >
                          {val}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  maxWidth: '220px',
                  margin: '4px auto 0',
                  fontSize: '7px',
                  color: '#687385'
                }}
              >
                <span>[NET]</span>
                <span>[TENGAH]</span>
                <span>[BASELINE]</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className={`pixel-btn ${isLocalReady ? '' : 'btn-primary'}`}
            onClick={handleRematchClick}
            style={{
              padding: '12px',
              fontSize: '12px',
              backgroundColor: isLocalReady ? '#263238' : undefined,
              borderColor: isLocalReady ? '#546e7a' : undefined,
              color: isLocalReady ? '#b0bec5' : undefined
            }}
          >
            {isLocalReady ? 'BATALKAN SIAP (MENUNGGU LAWAN...)' : 'MAIN LAGI (SAYA SIAP!)'}
          </button>

          <button
            className="pixel-btn"
            onClick={onQuitToLobby}
            style={{ padding: '10px', fontSize: '11px' }}
          >
            KEMBALI KE LOBI
          </button>
        </div>
      </div>
    </div>
  );
};
