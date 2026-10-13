import React from 'react';
import type { PlayerSlot } from '@shared/types';

interface PauseModalProps {
  pausedBy: PlayerSlot | null;
  p1Name: string;
  p2Name: string;
  onResume: () => void;
  onOpenSettings: () => void;
  onQuitToLobby: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  pausedBy,
  p1Name,
  p2Name,
  onResume,
  onOpenSettings,
  onQuitToLobby
}) => {
  const pauserName = pausedBy === 'p1' ? p1Name : (pausedBy === 'p2' ? p2Name : 'Pemain');

  return (
    <div className="modal-overlay">
      <div className="pixel-card" style={{ width: '420px', maxWidth: '90%', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: '20px',
            color: 'var(--color-ball)',
            marginBottom: '12px'
          }}
        >
          GAME DIJEDA
        </h2>

        <div style={{ fontSize: '11px', color: '#8c96a5', marginBottom: '24px' }}>
          Dijeda oleh: <span style={{ color: '#f0f4f8' }}>{pauserName}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            className="pixel-btn btn-primary"
            onClick={onResume}
            style={{ padding: '14px', fontSize: '12px' }}
          >
            LANJUTKAN PERMAINAN
          </button>

          <button
            className="pixel-btn"
            onClick={onOpenSettings}
            style={{ padding: '12px', fontSize: '11px' }}
          >
            PENGATURAN
          </button>

          <button
            className="pixel-btn"
            onClick={onQuitToLobby}
            style={{ padding: '12px', fontSize: '11px', color: '#e53935' }}
          >
            KELUAR KE LOBI
          </button>
        </div>
      </div>
    </div>
  );
};
