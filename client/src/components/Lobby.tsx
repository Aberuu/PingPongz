import React, { useState, useEffect } from 'react';
import type { RoomStateMsg, PlayerSlot, GameMode, BotDifficulty, PracticeZone } from '@shared/types';
import { network } from '../network/socketClient';

interface LobbyProps {
  roomState: RoomStateMsg;
  localSlot: PlayerSlot;
  onStartMatch: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomState,
  localSlot
}) => {
  const [activeTab, setActiveTab] = useState<'host' | 'join'>(localSlot === 'p1' ? 'host' : 'join');
  const [playerName, setPlayerName] = useState(localSlot === 'p1' ? 'Pemain 1' : 'Pemain 2');
  const [guestHostIp, setGuestHostIp] = useState(
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  );
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setActiveTab(localSlot === 'p1' ? 'host' : 'join');
    if (localSlot === 'p1') {
      setPlayerName(roomState.p1Name || 'Pemain 1');
    } else {
      setPlayerName(roomState.p2Name || 'Pemain 2');
    }
    const readyState = localSlot === 'p1' ? !!roomState.p1Ready : !!roomState.p2Ready;
    setIsReady(readyState);
  }, [localSlot, roomState.p1Ready, roomState.p2Ready, roomState.p1Name, roomState.p2Name]);

  const isHost = localSlot === 'p1';
  const shareAddress = roomState.hostAddress || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(shareAddress).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  const handleToggleReady = () => {
    const next = !isReady;
    setIsReady(next);
    network.setReady(next);
  };

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    network.joinRoom(val, activeTab === 'host' ? 'p1' : 'p2');
  };

  const handleConnectGuest = () => {
    network.connect(guestHostIp);
    network.joinRoom(playerName, 'p2');
  };

  return (
    <div className="modal-overlay">
      <div className="pixel-card" style={{ width: '560px', maxWidth: '92%' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1
            style={{
              fontSize: '22px',
              color: 'var(--color-ball)',
              textShadow: '3px 3px 0px #000000',
              marginBottom: '8px'
            }}
          >
            VOXELPONG 3D
          </h1>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
            1-LAWAN-1 TENIS MEJA LAN RETRO
          </div>
          <div
            style={{
              display: 'inline-block',
              marginTop: '10px',
              padding: '6px 14px',
              backgroundColor: localSlot === 'p1' ? '#b71c1c' : '#0d47a1',
              color: '#ffffff',
              fontSize: '10px',
              border: '2px solid #ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
            }}
          >
            POV ANDA: {localSlot === 'p1' ? 'PEMAIN 1 (RAKET MERAH)' : 'PEMAIN 2 (RAKET BIRU)'}
          </div>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button
            className={`pixel-btn ${activeTab === 'host' ? 'btn-primary' : ''}`}
            onClick={() => {
              setActiveTab('host');
              network.joinRoom(playerName, 'p1');
            }}
            style={{ flex: 1, fontSize: '11px' }}
          >
            HOST (PEMAIN 1)
          </button>
          <button
            className={`pixel-btn ${activeTab === 'join' ? 'btn-primary' : ''}`}
            onClick={() => {
              setActiveTab('join');
              network.joinRoom(playerName, 'p2');
            }}
            style={{ flex: 1, fontSize: '11px' }}
          >
            GABUNG (PEMAIN 2)
          </button>
        </div>

        {/* HOST PANEL */}
        {activeTab === 'host' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mode Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: '#8c96a5' }}>PILIH MODE PERMAINAN:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['match', 'bot', 'practice'] as GameMode[]).map((m) => (
                  <button
                    key={m}
                    className={`pixel-btn ${(roomState.gameMode ?? 'match') === m ? 'btn-primary' : ''}`}
                    onClick={() => network.setGameMode(m, roomState.botDifficulty, roomState.practiceZone)}
                    style={{ flex: 1, fontSize: '10px', padding: '8px 4px' }}
                  >
                    {m === 'match' ? 'LAN 1v1' : m === 'bot' ? 'Lawan Bot' : 'Mode Latihan'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bot Difficulty Options */}
            {(roomState.gameMode === 'bot') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: '#8c96a5' }}>TINGKAT KESULITAN BOT:</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['easy', 'medium', 'hard'] as BotDifficulty[]).map((d) => (
                    <button
                      key={d}
                      className={`pixel-btn ${(roomState.botDifficulty ?? 'medium') === d ? 'btn-primary' : ''}`}
                      onClick={() => network.setGameMode('bot', d, roomState.practiceZone)}
                      style={{ flex: 1, fontSize: '10px', padding: '6px 4px' }}
                    >
                      {d === 'easy' ? 'Mudah' : d === 'medium' ? 'Sedang' : 'Sulit'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Practice Target Zone Options */}
            {(roomState.gameMode === 'practice') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: '#8c96a5' }}>ZONA UMPAN BOLA LATIHAN:</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['center', 'left', 'right', 'random'] as PracticeZone[]).map((z) => (
                    <button
                      key={z}
                      className={`pixel-btn ${(roomState.practiceZone ?? 'random') === z ? 'btn-primary' : ''}`}
                      onClick={() => network.setPracticeZone(z)}
                      style={{ flex: 1, fontSize: '10px', padding: '6px 4px' }}
                    >
                      {z === 'center' ? 'Tengah' : z === 'left' ? 'Kiri' : z === 'right' ? 'Kanan' : 'Acak'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Share Address Card (Only needed in LAN mode) */}
            {(roomState.gameMode ?? 'match') === 'match' && (
              <div
                style={{
                  backgroundColor: '#10131a',
                  border: '2px solid #2e3644',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ fontSize: '10px', color: '#8c96a5' }}>
                  ALAMAT LAN UNTUK LAWAN:
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#ffb300',
                      wordBreak: 'break-all'
                    }}
                  >
                    {shareAddress}
                  </div>
                  <button
                    className="pixel-btn"
                    onClick={handleCopyAddress}
                    style={{ fontSize: '10px', padding: '8px 12px', whiteSpace: 'nowrap' }}
                  >
                    {copyFeedback ? 'TERSALIN!' : 'SALIN'}
                  </button>
                </div>
                <div style={{ fontSize: '8px', color: '#687385' }}>
                  Bagikan alamat ini ke PC lawan di Wi-Fi / LAN yang sama.
                </div>
              </div>
            )}

            {/* Player Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: '#8c96a5' }}>NAMA ANDA (P1):</label>
              <input
                type="text"
                className="pixel-input"
                value={playerName}
                maxLength={12}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            {/* Players Status Table */}
            <div
              style={{
                backgroundColor: '#10131a',
                border: '2px solid #2e3644',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '11px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#d32f2f' }}>P1 (HOST): {roomState.p1Name}</span>
                <span style={{ color: roomState.p1Ready ? '#4caf50' : '#8c96a5' }}>
                  {roomState.p1Ready ? '[SIAP]' : '[MENUNGGU]'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#1976d2' }}>
                  {roomState.gameMode === 'bot'
                    ? `P2 (BOT): ${roomState.p2Name}`
                    : roomState.gameMode === 'practice'
                    ? 'P2 (LATIHAN): Ball Machine'
                    : `P2 (TAMU): ${roomState.p2Connected ? roomState.p2Name : 'Belum bergabung'}`}
                </span>
                <span style={{ color: '#4caf50' }}>
                  {roomState.gameMode === 'bot' || roomState.gameMode === 'practice'
                    ? '[SIAP OTOMATIS]'
                    : roomState.p2Ready
                    ? '[SIAP]'
                    : roomState.p2Connected
                    ? '[MENUNGGU]'
                    : '[TERPUTUS]'}
                </span>
              </div>
            </div>

            {/* Ready Action */}
            <button
              className={`pixel-btn btn-ready ${isReady ? 'is-active' : ''}`}
              onClick={handleToggleReady}
              style={{ padding: '14px', fontSize: '13px' }}
            >
              {isReady ? 'BATALKAN SIAP' : 'SAYA SIAP!'}
            </button>
          </div>
        )}

        {/* JOIN PANEL */}
        {activeTab === 'join' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Host Address Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: '#8c96a5' }}>ALAMAT SERVER HOST:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="pixel-input"
                  value={guestHostIp}
                  style={{ flex: 1 }}
                  placeholder="http://192.168.1.x:3000"
                  onChange={(e) => setGuestHostIp(e.target.value)}
                />
                <button
                  className="pixel-btn"
                  onClick={handleConnectGuest}
                  style={{ fontSize: '10px', padding: '8px 12px' }}
                >
                  HUBUNGKAN
                </button>
              </div>
            </div>

            {/* Player Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: '#8c96a5' }}>NAMA ANDA (P2):</label>
              <input
                type="text"
                className="pixel-input"
                value={playerName}
                maxLength={12}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            {/* Connection Status */}
            <div
              style={{
                backgroundColor: '#10131a',
                border: '2px solid #2e3644',
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px'
              }}
            >
              <span style={{ color: '#1976d2' }}>STATUS TAMU:</span>
              <span style={{ color: roomState.p2Connected ? '#4caf50' : '#e53935' }}>
                {roomState.p2Connected ? 'TERHUBUNG KE SERVER' : 'BELUM TERHUBUNG'}
              </span>
            </div>

            {/* Ready Action */}
            <button
              className={`pixel-btn btn-ready ${isReady ? 'is-active' : ''}`}
              onClick={handleToggleReady}
              disabled={!roomState.p2Connected}
              style={{
                padding: '14px',
                fontSize: '13px',
                opacity: roomState.p2Connected ? 1 : 0.6,
                cursor: roomState.p2Connected ? 'pointer' : 'not-allowed'
              }}
            >
              {isReady ? 'BATALKAN SIAP' : 'SAYA SIAP!'}
            </button>
          </div>
        )}

        {/* Footer Guidance */}
        <div
          style={{
            marginTop: '18px',
            textAlign: 'center',
            fontSize: '9px',
            color: '#687385',
            lineHeight: '1.5'
          }}
        >
          Permainan dimulai otomatis saat kedua pemain menekan Siap.
        </div>
      </div>
    </div>
  );
};
