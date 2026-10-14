import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TableScene } from './TableScene';
import { CAMERA_PRESETS } from '@shared/constants';
import type { BallState, PaddleState, PlayerSlot, ScoreState, CameraMode, ScreenJuice, Handedness, CameraPreset, GameMode } from '@shared/types';

export type ResolutionPreset = 'low' | 'medium' | 'high';

interface GameCanvasProps {
  ball: BallState;
  p1Paddle: PaddleState;
  p2Paddle: PaddleState;
  localSlot: PlayerSlot;
  localPaddlePos: { x: number; y: number; swingZ: number; pitch: number; yaw: number; roll: number };
  resolution: ResolutionPreset;
  fov: number;
  showCrosshair: boolean;
  showBallIndicator?: boolean;
  showRallyTrajectory?: boolean;
  score?: ScoreState;
  cameraMode?: CameraMode;
  cameraPreset?: CameraPreset;
  customShoulderOffset?: number;
  showDebugObstruction?: boolean;
  gameMode?: GameMode;
  screenJuice?: ScreenJuice;
  handedness?: Handedness;
  currentRallyShots?: number;
  onCanvasClick?: () => void;
}

// Controller inside the Canvas to manage camera presets, dynamic tracking, and smash shake
const CameraController: React.FC<{
  localSlot: PlayerSlot;
  fov: number;
  cameraMode?: CameraMode;
  cameraPreset?: CameraPreset;
  customShoulderOffset?: number;
  screenJuice?: ScreenJuice;
  handedness?: Handedness;
  localPaddlePos: { x: number; y: number; swingZ: number };
  ballPos: { x: number; y: number; z: number };
  shakeTimestamp: number;
}> = ({
  localSlot,
  fov,
  cameraMode = 'subtle',
  cameraPreset = 'ots',
  customShoulderOffset = 0.35,
  screenJuice = 'subtle',
  handedness = 'right',
  localPaddlePos,
  ballPos,
  shakeTimestamp
}) => {
  const { camera } = useThree();

  const cfg = CAMERA_PRESETS[cameraPreset || 'ots'] || CAMERA_PRESETS.ots;
  const baseY = cfg.baseY;
  const baseZ = localSlot === 'p1' ? cfg.baseZ : -cfg.baseZ;
  const lookY = cfg.lookY;
  const lookZ = localSlot === 'p1' ? cfg.lookZ : -cfg.lookZ;

  const currentCamX = useRef(0);
  const currentLookX = useRef(0);

  // Shake timer & FOV pop state
  const shakeTimer = useRef(0);
  const fovKick = useRef(0);
  const lastShakeTs = useRef(0);

  useEffect(() => {
    if (shakeTimestamp > lastShakeTs.current && screenJuice !== 'off') {
      lastShakeTs.current = shakeTimestamp;
      shakeTimer.current = 0.16;
      fovKick.current = screenJuice === 'full' ? 3.0 : 2.0;
    }
  }, [shakeTimestamp, screenJuice]);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, fov]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    // 1. Dynamic camera shift following character body
    // Using PRD 3.0 offset formula (c >= 0.35m) and 88% horizontal body tracking
    const sideSign = (handedness === 'left' ? 1 : -1) * (localSlot === 'p1' ? 1 : -1);
    const shoulderOffset = sideSign * (customShoulderOffset || cfg.shoulderOffset);
    const shiftRatio = cameraMode === 'static' ? 0 : cfg.shiftRatio;
    // Character body center stands at approximately localPaddlePos.x * 0.65
    const targetCamX = (localPaddlePos.x * 0.65) * shiftRatio + shoulderOffset;
    currentCamX.current += (targetCamX - currentCamX.current) * Math.min(1.0, delta * 9);

    // 2. Dynamic camera lookAt following ball rallies with edge peek boost
    const basePeek = cameraMode === 'static' ? 0 : cameraMode === 'dynamic' ? 0.22 : 0.12;
    const edgePeekBoost = Math.abs(ballPos.x) > 0.55 ? 0.08 : 0.0;
    const targetLookX = ballPos.x * (basePeek + edgePeekBoost);
    currentLookX.current += (targetLookX - currentLookX.current) * Math.min(1.0, delta * 10);

    // Vertical subtle follow for high/low strokes
    const heightTrack = (localPaddlePos.y - 0.95) * 0.10;

    // 3. Camera Shake on Smash
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (shakeTimer.current > 0) {
      const intensity = (shakeTimer.current / 0.16) * 0.022;
      shakeOffsetX = (Math.random() - 0.5) * intensity;
      shakeOffsetY = (Math.random() - 0.5) * intensity;
      shakeTimer.current = Math.max(0, shakeTimer.current - delta);
    }

    // 4. FOV Kick on Smash
    if (fovKick.current > 0) {
      fovKick.current = Math.max(0, fovKick.current - delta * 16);
      camera.fov = fov + fovKick.current;
      camera.updateProjectionMatrix();
    } else if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Apply final camera position & target
    camera.position.set(
      currentCamX.current + shakeOffsetX,
      baseY + heightTrack + shakeOffsetY,
      baseZ
    );
    camera.lookAt(currentLookX.current, lookY, lookZ);
    camera.updateProjectionMatrix();
  });

  return null;
};

export const GameCanvas: React.FC<GameCanvasProps> = ({
  ball,
  p1Paddle,
  p2Paddle,
  localSlot,
  localPaddlePos,
  resolution,
  fov,
  showCrosshair,
  showBallIndicator = true,
  showRallyTrajectory = true,
  score,
  cameraMode = 'subtle',
  cameraPreset = 'ots',
  customShoulderOffset = 0.35,
  showDebugObstruction = false,
  gameMode = 'match',
  screenJuice = 'subtle',
  handedness = 'right',
  currentRallyShots = 0,
  onCanvasClick
}) => {
  const [shakeTs, setShakeTs] = useState(0);

  const handleSmashShake = useCallback(() => {
    setShakeTs(Date.now());
  }, []);

  const cfg = CAMERA_PRESETS[cameraPreset || 'ots'] || CAMERA_PRESETS.ots;
  const initialCameraPos = useMemo<[number, number, number]>(() => {
    const z = localSlot === 'p2' ? -cfg.baseZ : cfg.baseZ;
    return [0, cfg.baseY, z];
  }, [localSlot, cfg]);

  // Pixel ratio based on resolution preset
  const dpr = useMemo(() => {
    if (resolution === 'low') return 0.55;
    if (resolution === 'medium') return 1.0;
    return typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1.5;
  }, [resolution]);

  // Check if ball is near screen edge for peripheral indicator
  const isBallEdgeLeft = ball.pos.x < -0.75;
  const isBallEdgeRight = ball.pos.x > 0.75;

  return (
    <div
      className="canvas-container"
      onClick={onCanvasClick}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0c10',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '1920px',
          maxHeight: '1080px',
          aspectRatio: '16 / 9',
          position: 'relative'
        }}
      >
        <Canvas
          key={`${localSlot}-${cameraPreset}`}
          dpr={dpr}
          camera={{
            position: initialCameraPos,
            fov: fov,
            near: 0.1,
            far: 50
          }}
          gl={{
            antialias: resolution !== 'low',
            powerPreference: 'high-performance'
          }}
          style={{
            width: '100%',
            height: '100%',
            imageRendering: resolution === 'low' ? 'pixelated' : 'auto'
          }}
          onCreated={({ camera }) => {
            const zPos = localSlot === 'p2' ? -cfg.baseZ : cfg.baseZ;
            const lookZ = localSlot === 'p2' ? -cfg.lookZ : cfg.lookZ;
            camera.position.set(0, cfg.baseY, zPos);
            camera.lookAt(0, cfg.lookY, lookZ);
            camera.updateProjectionMatrix();
          }}
        >
          <CameraController
            localSlot={localSlot}
            fov={fov}
            cameraMode={cameraMode}
            cameraPreset={cameraPreset}
            customShoulderOffset={customShoulderOffset}
            screenJuice={screenJuice}
            handedness={handedness}
            localPaddlePos={localPaddlePos}
            ballPos={ball.pos}
            shakeTimestamp={shakeTs}
          />
          <TableScene
            ball={ball}
            p1Paddle={p1Paddle}
            p2Paddle={p2Paddle}
            localSlot={localSlot}
            localPaddlePos={localPaddlePos}
            score={score}
            showBallIndicator={showBallIndicator}
            showRallyTrajectory={showRallyTrajectory}
            cameraPreset={cameraPreset}
            gameMode={gameMode}
            handedness={handedness}
            screenJuice={screenJuice}
            currentRallyShots={currentRallyShots}
            onSmashShake={handleSmashShake}
          />
        </Canvas>

        {/* Edge Ball Direction Indicators (Section 3) */}
        {isBallEdgeLeft && (
          <div
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#ffb300',
              fontSize: '22px',
              fontWeight: 900,
              textShadow: '0 0 8px rgba(255, 179, 0, 0.8)',
              pointerEvents: 'none',
              animation: 'pulse 0.4s infinite alternate'
            }}
          >
            ◀
          </div>
        )}
        {isBallEdgeRight && (
          <div
            style={{
              position: 'absolute',
              right: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#ffb300',
              fontSize: '22px',
              fontWeight: 900,
              textShadow: '0 0 8px rgba(255, 179, 0, 0.8)',
              pointerEvents: 'none',
              animation: 'pulse 0.4s infinite alternate'
            }}
          >
            ▶
          </div>
        )}

        {/* Debug Obstruction Overlay (Section 2) */}
        {showDebugObstruction && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #10b981',
              padding: '4px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '10px',
              color: '#10b981',
              pointerEvents: 'none'
            }}
          >
            LOS OBSTRUCTION: 0% (CLEAR) | CAM: {cameraPreset.toUpperCase()}
          </div>
        )}

        {/* Retro Crosshair Overlay */}
        {showCrosshair && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              width: '12px',
              height: '12px'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '5px',
                left: 0,
                width: '12px',
                height: '2px',
                backgroundColor: 'rgba(255, 255, 255, 0.55)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '5px',
                width: '2px',
                height: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.55)'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
