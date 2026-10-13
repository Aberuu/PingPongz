import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TableScene } from './TableScene';
import type { BallState, PaddleState, PlayerSlot, ScoreState, CameraMode, ScreenJuice, Handedness } from '@shared/types';

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
  score?: ScoreState;
  cameraMode?: CameraMode;
  screenJuice?: ScreenJuice;
  handedness?: Handedness;
  onCanvasClick?: () => void;
}

// Controller inside the Canvas to manage centered POV, gentle paddle/ball tracking, and smash shake
const CameraController: React.FC<{
  localSlot: PlayerSlot;
  fov: number;
  cameraMode?: CameraMode;
  screenJuice?: ScreenJuice;
  localPaddlePos: { x: number; y: number; swingZ: number };
  ballPos: { x: number; y: number; z: number };
  shakeTimestamp: number;
}> = ({
  localSlot,
  fov,
  cameraMode = 'subtle',
  screenJuice = 'subtle',
  localPaddlePos,
  ballPos,
  shakeTimestamp
}) => {
  const { camera } = useThree();

  // Baseline camera coordinates centered strictly on table X axis (Section 2)
  const baseY = 1.18;
  const baseZ = localSlot === 'p1' ? 2.45 : -2.45;
  const lookY = 0.74;

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

    // 1. Subtle camera shift following paddle
    const shiftRatio = cameraMode === 'static' ? 0 : cameraMode === 'dynamic' ? 0.09 : 0.055;
    const targetCamX = localPaddlePos.x * shiftRatio;
    currentCamX.current += (targetCamX - currentCamX.current) * Math.min(1.0, delta * 10);

    // 2. Subtle camera lookAt following ball
    const peekRatio = cameraMode === 'static' ? 0 : cameraMode === 'dynamic' ? 0.14 : 0.075;
    const targetLookX = ballPos.x * peekRatio;
    currentLookX.current += (targetLookX - currentLookX.current) * Math.min(1.0, delta * 12);

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
      baseY + shakeOffsetY,
      baseZ
    );
    camera.lookAt(currentLookX.current, lookY, 0);
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
  score,
  cameraMode = 'subtle',
  screenJuice = 'subtle',
  handedness = 'right',
  onCanvasClick
}) => {
  const [shakeTs, setShakeTs] = useState(0);

  const handleSmashShake = useCallback(() => {
    setShakeTs(Date.now());
  }, []);

  const initialCameraPos = useMemo<[number, number, number]>(() => {
    return localSlot === 'p2' ? [0, 1.18, -2.45] : [0, 1.18, 2.45];
  }, [localSlot]);

  // Pixel ratio based on resolution preset
  const dpr = useMemo(() => {
    if (resolution === 'low') return 0.55;
    if (resolution === 'medium') return 1.0;
    return typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1.5;
  }, [resolution]);

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
          key={localSlot}
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
            if (localSlot === 'p2') {
              camera.position.set(0, 1.18, -2.45);
            } else {
              camera.position.set(0, 1.18, 2.45);
            }
            camera.lookAt(0, 0.74, 0);
            camera.updateProjectionMatrix();
          }}
        >
          <CameraController
            localSlot={localSlot}
            fov={fov}
            cameraMode={cameraMode}
            screenJuice={screenJuice}
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
            handedness={handedness}
            screenJuice={screenJuice}
            onSmashShake={handleSmashShake}
          />
        </Canvas>

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
