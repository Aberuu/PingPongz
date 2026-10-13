import React, { useState, useEffect, useRef } from 'react';
import type {
  SnapshotData,
  RoomStateMsg,
  PlayerSlot,
  BallState,
  PaddleState,
  GamePhase
} from '@shared/types';
import { TABLE_DIMENSIONS, PADDLE_PHYSICS } from '@shared/constants';
import { network } from './network/socketClient';
import { useMouseControls } from './controls/useMouseControls';
import { GameCanvas, type ResolutionPreset } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { Lobby } from './components/Lobby';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { SettingsModal, type UserSettings } from './components/SettingsModal';
import { soundFx } from './audio/synth';
import './styles/arcade.css';

const defaultBall: BallState = {
  pos: { x: 0, y: TABLE_DIMENSIONS.height + 0.15, z: 0 },
  velocity: { x: 0, y: 0, z: 0 }
};

const defaultPaddle: PaddleState = {
  pos: { x: 0, y: 0.95, z: PADDLE_PHYSICS.p1BaseZ },
  velocity: { x: 0, y: 0, z: 0 },
  pitch: 0,
  yaw: 0,
  roll: 0,
  isSmashing: false
};

export const App: React.FC = () => {
  // Settings with local persistence
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem('voxelpong_settings');
      if (saved) return JSON.parse(saved);
    } catch {
      // Use defaults
    }
    return {
      sensitivity: 1.0,
      fov: 75,
      volume: 0.7,
      isMuted: false,
      resolution: 'medium' as ResolutionPreset,
      showCrosshair: true,
      showBallIndicator: true,
      assistPreset: 'normal',
      cameraMode: 'subtle',
      handedness: 'right',
      screenJuice: 'subtle'
    };
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localSlot, setLocalSlot] = useState<PlayerSlot>('p1');
  const [fps, setFps] = useState(60);

  // Synchronized Game State from Server
  const [snapshot, setSnapshot] = useState<SnapshotData>({
    seq: 0,
    serverTime: Date.now(),
    phase: 'LOBBY',
    score: { p1: 0, p2: 0 },
    serverSlot: 'p1',
    ball: defaultBall,
    p1Paddle: defaultPaddle,
    p2Paddle: { ...defaultPaddle, pos: { x: 0, y: 0.95, z: PADDLE_PHYSICS.p2BaseZ } },
    countdown: 3,
    disconnectCountdown: 30,
    pausedBy: null,
    winner: null
  });

  const [roomState, setRoomState] = useState<RoomStateMsg>({
    p1Connected: false,
    p2Connected: false,
    p1Ready: false,
    p2Ready: false,
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    hostAddress: ''
  });

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Mouse Controls Hook
  const { isLocked, requestLock, smashCooldownRatio, paddlePos } = useMouseControls({
    sensitivity: settings.sensitivity,
    playerSlot: localSlot,
    isActive: snapshot.phase === 'RALLY' || snapshot.phase === 'SERVING',
    assistPreset: settings.assistPreset,
    handedness: settings.handedness,
    onServeAction: () => {
      network.sendServeAction();
    },
    onPauseToggle: () => {
      network.sendPauseToggle();
    }
  });

  // Connect to server on mount
  useEffect(() => {
    network.connect();

    const unsubSlot = network.onSlotAssigned((slot) => {
      setLocalSlot(slot);
    });

    const unsubRoom = network.onRoomState((st) => {
      setRoomState(st);
    });

    const unsubSnap = network.onSnapshot((snap) => {
      // Throttle React component tree re-renders to UI-critical state changes only
      setSnapshot((prev) => {
        if (
          prev.phase !== snap.phase ||
          prev.score.p1 !== snap.score.p1 ||
          prev.score.p2 !== snap.score.p2 ||
          prev.countdown !== snap.countdown ||
          prev.disconnectCountdown !== snap.disconnectCountdown ||
          prev.serverSlot !== snap.serverSlot ||
          prev.pausedBy !== snap.pausedBy ||
          prev.winner !== snap.winner
        ) {
          return snap;
        }
        return prev;
      });
    });

    return () => {
      unsubSlot();
      unsubRoom();
      unsubSnap();
    };
  }, []);

  // Sync initial sound volume
  useEffect(() => {
    soundFx.setVolume(settings.volume);
    soundFx.isMuted = settings.isMuted;
  }, [settings.volume, settings.isMuted]);

  // Measure Real Client Render FPS
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const loop = (now: number) => {
      frameCount += 1;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleCanvasClick = () => {
    if (snapshot.phase !== 'LOBBY' && snapshot.phase !== 'PAUSED' && !isSettingsOpen) {
      requestLock(canvasContainerRef.current);
    }
  };

  return (
    <div className="arcade-viewport" ref={canvasContainerRef}>
      {/* 3D Render Canvas */}
      <GameCanvas
        ball={snapshot.ball}
        p1Paddle={snapshot.p1Paddle}
        p2Paddle={snapshot.p2Paddle}
        localSlot={localSlot}
        localPaddlePos={paddlePos}
        score={snapshot.score}
        resolution={settings.resolution}
        fov={settings.fov}
        showCrosshair={settings.showCrosshair}
        showBallIndicator={settings.showBallIndicator}
        cameraMode={settings.cameraMode}
        screenJuice={settings.screenJuice}
        handedness={settings.handedness}
        onCanvasClick={handleCanvasClick}
      />

      {/* Retro Scanline CRT Filter */}
      <div className="scanline-overlay" />

      {/* In-Game HUD (Always active unless in Lobby) */}
      {snapshot.phase !== 'LOBBY' && (
        <HUD
          score={snapshot.score}
          serverSlot={snapshot.serverSlot}
          localSlot={localSlot}
          phase={snapshot.phase}
          countdown={snapshot.countdown}
          disconnectCountdown={snapshot.disconnectCountdown}
          smashCooldownRatio={smashCooldownRatio}
          ping={network.ping}
          fps={fps}
          p1Name={roomState.p1Name}
          p2Name={roomState.p2Name}
          isPointerLocked={isLocked}
          onLockClick={handleCanvasClick}
          onSettingsClick={() => setIsSettingsOpen(true)}
        />
      )}

      {/* Lobby Screen */}
      {snapshot.phase === 'LOBBY' && (
        <Lobby
          roomState={roomState}
          localSlot={localSlot}
          onStartMatch={() => {}}
        />
      )}

      {/* Pause Screen */}
      {snapshot.phase === 'PAUSED' && (
        <PauseModal
          pausedBy={snapshot.pausedBy}
          p1Name={roomState.p1Name}
          p2Name={roomState.p2Name}
          onResume={() => network.sendPauseToggle()}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onQuitToLobby={() => {
            network.sendPauseToggle();
            network.setReady(false);
          }}
        />
      )}

      {/* Game Over Screen */}
      {snapshot.phase === 'GAME_OVER' && (
        <GameOverModal
          score={snapshot.score}
          winner={snapshot.winner}
          p1Name={roomState.p1Name}
          p2Name={roomState.p2Name}
          localSlot={localSlot}
          onRematch={() => network.sendRematch()}
          onQuitToLobby={() => {
            network.setReady(false);
          }}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={setSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};
