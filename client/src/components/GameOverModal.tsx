import React from 'react';
import type { ScoreState, PlayerSlot } from '@shared/types';

interface GameOverModalProps {
  score: ScoreState;
  winner: PlayerSlot | null;
  p1Name: string;
  p2Name: string;
  localSlot: PlayerSlot;
  onRematch: () => void;
  onQuitToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  winner,
  p1Name,
  p2Name,
  localSlot,
  onRematch,
  onQuitToLobby
}) => {
  const isWinner = winner === localSlot;
  const winnerName = winner === 'p1' ? p1Name : p2Name;

  return (
    <div className="modal-overlay">
      <div className="pixel-card" style={{ width: '480px', maxWidth: '90%', textAlign: 'center' }}>
        <div
          style={{
            fontSize: '24px',
            color: isWinner ? '#4caf50' : '#e53935',
            marginBottom: '8px'
          }}
        >
          {isWinner ? 'KEMENANGAN!' : 'KEKALAHAN'}
        </div>

        <div style={{ fontSize: '13px', color: '#ffb300', marginBottom: '20px' }}>
          {winnerName} MEMENANGKAN PERTANDINGAN
        </div>

        {/* Final Score Board */}
        <div
          style={{
            backgroundColor: '#10131a',
            border: '3px solid #2e3644',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '24px'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#d32f2f', marginBottom: '4px' }}>{p1Name}</div>
            <div style={{ fontSize: '32px', color: '#f0f4f8' }}>{score.p1}</div>
          </div>
          <div style={{ fontSize: '18px', color: '#556680' }}>:</div>
          <div>
            <div style={{ fontSize: '11px', color: '#1976d2', marginBottom: '4px' }}>{p2Name}</div>
            <div style={{ fontSize: '32px', color: '#f0f4f8' }}>{score.p2}</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            className="pixel-btn btn-primary"
            onClick={onRematch}
            style={{ padding: '14px', fontSize: '13px' }}
          >
            TANDING ULANG (REMATCH)
          </button>

          <button
            className="pixel-btn"
            onClick={onQuitToLobby}
            style={{ padding: '12px', fontSize: '11px' }}
          >
            KEMBALI KE LOBI
          </button>
        </div>
      </div>
    </div>
  );
};
