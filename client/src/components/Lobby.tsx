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
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [showAdvancedIp, setShowAdvancedIp] = useState(false);
  const [guestHostIp, setGuestHostIp] = useState(
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  );
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      if (roomParam) {
        setInputRoomCode(roomParam.toUpperCase());
        setActiveTab('join');
      }
    }
  }, []);

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
  const baseUrl = roomState.hostAddress || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const shareAddress = roomState.roomId ? `${baseUrl}/?room=${roomState.roomId}` : baseUrl;

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
    network.joinRoom(val, activeTab === 'host' ? 'p1' : 'p2', roomState.roomId);
  };

  const handleCreateNewRoom = () => {
    network.createRoom(playerName, roomState.gameMode);
  };

  const handleJoinWithCode = () => {
    const code = (inputRoomCode || '').trim().toUpperCase();
    if (!code) return;
    network.joinRoom(playerName, 'p2', code);
  };

  const handleQuickMatch = () => {
    network.quickMatch(playerName);
  };

  const handleConnectGuest = () => {
    network.connect(guestHostIp);
    network.joinRoom(playerName, 'p2', inputRoomCode);
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
              network.joinRoom(playerName, 'p1', roomState.roomId);
            }}
            style={{ flex: 1, fontSize: '11px' }}
          >
            HOST (PEMAIN 1)
          </button>
          <button
            className={`pixel-btn ${activeTab === 'join' ? 'btn-primary' : ''}`}
            onClick={() => {
              setActiveTab('join');
              network.joinRoom(playerName, 'p2', roomState.roomId);
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

            {/* Dynamic Rally Power Option */}
            <div
              style={{
                backgroundColor: '#10131a',
                border: '1px solid #2e3644',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '10px', color: '#f0f4f8', fontWeight: 'bold' }}>
                  POWER RELI DINAMIS (RALLY HEAT)
                </span>
                <span style={{ fontSize: '8px', color: '#8c96a5' }}>
                  Kecepatan & tenaga bertambah halus setiap pukulan reli (maks +25%)
                </span>
              </div>
              <button
                className={`pixel-btn ${(roomState.dynamicRallyPower ?? true) ? 'btn-primary' : ''}`}
                onClick={() => network.setDynamicRallyPower(!(roomState.dynamicRallyPower ?? true))}
                style={{ fontSize: '9px', padding: '6px 10px', minWidth: '80px' }}
              >
                {(roomState.dynamicRallyPower ?? true) ? 'AKTIF' : 'NONAKTIF'}
              </button>
            </div>

            {/* Share Room Code & Link */}
            {(roomState.gameMode ?? 'match') === 'match' && (
              <div
                style={{
                  backgroundColor: '#10131a',
                  border: '2px solid #2e3644',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#8c96a5' }}>KODE KAMAR ANDA:</span>
                  <button
                    className="pixel-btn"
                    onClick={handleCreateNewRoom}
                    style={{ fontSize: '8px', padding: '4px 8px' }}
                    title="Buat kamar baru dengan kode acak"
                  >
                    + BUAT KODE BARU
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    backgroundColor: '#0a0d14',
                    border: '1px solid #3d495c',
                    padding: '8px 12px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '22px',
                      color: '#ffb300',
                      letterSpacing: '2px',
                      fontWeight: 'bold',
                      textShadow: '0 0 10px rgba(255, 179, 0, 0.4)'
                    }}
                  >
                    {roomState.roomId || 'MAIN'}
                  </div>
                  <button
                    className="pixel-btn btn-primary"
                    onClick={handleCopyAddress}
                    style={{ fontSize: '10px', padding: '8px 12px', whiteSpace: 'nowrap' }}
                  >
                    {copyFeedback ? 'LINK TERSALIN!' : '📋 SALIN LINK'}
                  </button>
                </div>

                <div style={{ fontSize: '8px', color: '#687385', lineHeight: '1.4' }}>
                  Bagikan kode kamar ini atau salin link undangan untuk bermain bersama teman.
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
            {/* Room Code Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: '#8c96a5' }}>MASUKKAN KODE KAMAR (5-6 KARAKTER):</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="pixel-input"
                  value={inputRoomCode}
                  style={{ flex: 1, letterSpacing: '2px', fontWeight: 'bold', textTransform: 'uppercase' }}
                  placeholder="CONTOH: VX88"
                  maxLength={10}
                  onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                />
                <button
                  className="pixel-btn btn-primary"
                  onClick={handleJoinWithCode}
                  disabled={!inputRoomCode.trim()}
                  style={{ fontSize: '10px', padding: '8px 14px' }}
                >
                  GABUNG KAMAR
                </button>
              </div>
            </div>

            {/* Quick Match Option */}
            <div
              style={{
                backgroundColor: '#10131a',
                border: '2px solid #2e3644',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}
            >
              <div style={{ fontSize: '9px', color: '#8c96a5' }}>
                Tidak punya kode kamar? Cari lawan online acak:
              </div>
              <button
                className="pixel-btn"
                onClick={handleQuickMatch}
                style={{ fontSize: '9px', padding: '8px 12px', whiteSpace: 'nowrap', backgroundColor: '#1a2332' }}
              >
                ⚡ CARI LAWAN
              </button>
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
              <span style={{ color: '#1976d2' }}>KAMAR TERHUBUNG:</span>
              <span style={{ color: roomState.roomId ? '#ffb300' : '#8c96a5', fontWeight: 'bold' }}>
                {roomState.roomId || 'BELUM TERHUBUNG'}
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

            {/* Collapsible Advanced Custom IP */}
            <div style={{ textAlign: 'center', marginTop: '4px' }}>
              <button
                onClick={() => setShowAdvancedIp(!showAdvancedIp)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#556680',
                  fontSize: '9px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textDecoration: 'underline'
                }}
              >
                {showAdvancedIp ? 'Sembunyikan Pengaturan IP Manual' : 'Opsi Lanjutan: IP Server Manual'}
              </button>

              {showAdvancedIp && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="pixel-input"
                    value={guestHostIp}
                    style={{ flex: 1, fontSize: '9px' }}
                    placeholder="http://192.168.x.x:3000"
                    onChange={(e) => setGuestHostIp(e.target.value)}
                  />
                  <button
                    className="pixel-btn"
                    onClick={handleConnectGuest}
                    style={{ fontSize: '9px', padding: '6px 10px' }}
                  >
                    KONEK IP
                  </button>
                </div>
              )}
            </div>
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
