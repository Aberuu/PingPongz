import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TABLE_DIMENSIONS, NET_DIMENSIONS, BALL_PHYSICS, PADDLE_PHYSICS } from '@shared/constants';
import type { BallState, PaddleState, PlayerSlot, ScoreState, Handedness, ScreenJuice } from '@shared/types';
import { network } from '../network/socketClient';

interface TableSceneProps {
  ball: BallState;
  p1Paddle: PaddleState;
  p2Paddle: PaddleState;
  localSlot: PlayerSlot;
  localPaddlePos: { x: number; y: number; swingZ: number; pitch: number; yaw: number; roll: number };
  score?: ScoreState;
  showBallIndicator?: boolean;
  handedness?: Handedness;
  screenJuice?: ScreenJuice;
  onSmashShake?: () => void;
}

// Particle interface for hit juice
interface ParticleData {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: string;
}

// Stepped voxel circular paddle blade & handle
const VoxelPaddleMesh: React.FC<{
  rubberColor: string;
}> = ({ rubberColor }) => {
  return (
    <group>
      {/* Front Rubber (Stepped Voxel Disc) */}
      <group position={[0, 0, 0.005]}>
        <mesh>
          <boxGeometry args={[0.16, 0.12, 0.012]} />
          <meshLambertMaterial color={rubberColor} flatShading />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.13, 0.025, 0.012]} />
          <meshLambertMaterial color={rubberColor} flatShading />
        </mesh>
        <mesh position={[0, -0.07, 0]}>
          <boxGeometry args={[0.13, 0.025, 0.012]} />
          <meshLambertMaterial color={rubberColor} flatShading />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.08, 0.02, 0.012]} />
          <meshLambertMaterial color={rubberColor} flatShading />
        </mesh>
        <mesh position={[0.085, 0, 0]}>
          <boxGeometry args={[0.015, 0.08, 0.012]} />
          <meshLambertMaterial color={rubberColor} flatShading />
        </mesh>
        <mesh position={[-0.085, 0, 0]}>
          <boxGeometry args={[0.015, 0.08, 0.012]} />
          <meshLambertMaterial color={rubberColor} flatShading />
        </mesh>
      </group>

      {/* Back Rubber (Black Stepped Voxel Disc) */}
      <group position={[0, 0, -0.005]}>
        <mesh>
          <boxGeometry args={[0.16, 0.12, 0.012]} />
          <meshLambertMaterial color="#18181b" flatShading />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.13, 0.025, 0.012]} />
          <meshLambertMaterial color="#18181b" flatShading />
        </mesh>
        <mesh position={[0, -0.07, 0]}>
          <boxGeometry args={[0.13, 0.025, 0.012]} />
          <meshLambertMaterial color="#18181b" flatShading />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.08, 0.02, 0.012]} />
          <meshLambertMaterial color="#18181b" flatShading />
        </mesh>
        <mesh position={[0.085, 0, 0]}>
          <boxGeometry args={[0.015, 0.08, 0.012]} />
          <meshLambertMaterial color="#18181b" flatShading />
        </mesh>
        <mesh position={[-0.085, 0, 0]}>
          <boxGeometry args={[0.015, 0.08, 0.012]} />
          <meshLambertMaterial color="#18181b" flatShading />
        </mesh>
      </group>

      {/* Wooden Paddle Handle */}
      <mesh position={[0, -0.13, 0]}>
        <boxGeometry args={[0.032, 0.11, 0.022]} />
        <meshLambertMaterial color="#c89666" flatShading />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[0.042, 0.025, 0.024]} />
        <meshLambertMaterial color="#b37c4e" flatShading />
      </mesh>
    </group>
  );
};

// Unified local hand and paddle model: arm and paddle are one single chain
const UnifiedLocalPaddleAndArm: React.FC<{
  rubberColor: string;
  shirtColor: string;
  handedness?: Handedness;
  recoilZ?: number;
}> = ({ rubberColor, shirtColor, handedness = 'right', recoilZ = 0 }) => {
  const isRight = handedness === 'right';
  const armSign = isRight ? 1 : -1;

  return (
    <group position={[0, 0, recoilZ]}>
      {/* 1. Paddle Mesh */}
      <VoxelPaddleMesh rubberColor={rubberColor} />

      {/* 2. Hand wrapped around the wooden handle */}
      <mesh position={[0, -0.13, 0]}>
        <boxGeometry args={[0.048, 0.085, 0.044]} />
        <meshLambertMaterial color="#f0b78c" flatShading />
      </mesh>

      {/* 3. Forearm extending from handle towards bottom corner of screen */}
      <group position={[armSign * 0.03, -0.18, 0.06]}>
        {/* Wrist */}
        <mesh
          position={[armSign * 0.025, -0.04, 0.05]}
          rotation={[-0.45, armSign * 0.35, armSign * -0.25]}
        >
          <boxGeometry args={[0.06, 0.10, 0.06]} />
          <meshLambertMaterial color="#f0b78c" flatShading />
        </mesh>
        {/* Main Forearm */}
        <mesh
          position={[armSign * 0.07, -0.13, 0.14]}
          rotation={[-0.65, armSign * 0.42, armSign * -0.35]}
        >
          <boxGeometry args={[0.08, 0.18, 0.08]} />
          <meshLambertMaterial color="#f0b78c" flatShading />
        </mesh>
        {/* Sleeve (Shirt Color) */}
        <mesh
          position={[armSign * 0.12, -0.23, 0.23]}
          rotation={[-0.65, armSign * 0.42, armSign * -0.35]}
        >
          <boxGeometry args={[0.11, 0.15, 0.11]} />
          <meshLambertMaterial color={shirtColor} flatShading />
        </mesh>
      </group>
    </group>
  );
};

// Voxel Opponent Avatar across the table
const OpponentAvatar: React.FC<{
  position: [number, number, number];
  rotationY: number;
  shirtColor: string;
  paddleX: number;
  paddleY: number;
}> = ({ position, rotationY, shirtColor, paddleX, paddleY }) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Head */}
      <group position={[paddleX * 0.35, 1.48, 0]}>
        <mesh>
          <boxGeometry args={[0.26, 0.26, 0.26]} />
          <meshLambertMaterial color="#f0b78c" flatShading />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.28, 0.12, 0.28]} />
          <meshLambertMaterial color="#4a2c16" flatShading />
        </mesh>
        <mesh position={[0, 0.04, 0.135]}>
          <boxGeometry args={[0.24, 0.06, 0.03]} />
          <meshLambertMaterial color="#4a2c16" flatShading />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.06, 0, 0.132]}>
          <boxGeometry args={[0.035, 0.035, 0.01]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0.06, 0, 0.132]}>
          <boxGeometry args={[0.035, 0.035, 0.01]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* Torso (Shirt) */}
      <group position={[paddleX * 0.25, 0.98, 0]}>
        <mesh>
          <boxGeometry args={[0.42, 0.48, 0.26]} />
          <meshLambertMaterial color={shirtColor} flatShading />
        </mesh>
        <mesh position={[0, 0.22, 0.11]}>
          <boxGeometry args={[0.16, 0.05, 0.06]} />
          <meshLambertMaterial color="#f0b78c" flatShading />
        </mesh>
      </group>

      {/* Shorts / Hips */}
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[0.40, 0.22, 0.24]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.11, 0.28, 0]}>
        <boxGeometry args={[0.13, 0.54, 0.16]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>
      <mesh position={[0.11, 0.28, 0]}>
        <boxGeometry args={[0.13, 0.54, 0.16]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>

      {/* Left Non-Playing Arm */}
      <group position={[-0.26, 1.05, 0]}>
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[0.12, 0.14, 0.14]} />
          <meshLambertMaterial color={shirtColor} flatShading />
        </mesh>
        <mesh position={[0.02, -0.22, 0.08]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.09, 0.22, 0.09]} />
          <meshLambertMaterial color="#f0b78c" flatShading />
        </mesh>
      </group>

      {/* Right Playing Arm reaching to paddle */}
      <group position={[0.26, 1.05, 0]}>
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[0.12, 0.14, 0.14]} />
          <meshLambertMaterial color={shirtColor} flatShading />
        </mesh>
        <mesh
          position={[(paddleX - 0.26) * 0.4, (paddleY - 1.05) * 0.4, 0.22]}
          rotation={[-0.6, 0, 0]}
        >
          <boxGeometry args={[0.10, 0.24, 0.10]} />
          <meshLambertMaterial color="#f0b78c" flatShading />
        </mesh>
      </group>
    </group>
  );
};

// 7-segment LED digit for authentic retro gym scoreboard
const SevenSegmentDigit: React.FC<{ value: number }> = ({ value }) => {
  const v = Math.max(0, Math.min(9, Math.floor(value)));
  const map: Record<number, boolean[]> = {
    0: [true, true, true, true, true, true, false],
    1: [false, true, true, false, false, false, false],
    2: [true, true, false, true, true, false, true],
    3: [true, true, true, true, false, false, true],
    4: [false, true, true, false, false, true, true],
    5: [true, false, true, true, false, true, true],
    6: [true, false, true, true, true, true, true],
    7: [true, true, true, false, false, false, false],
    8: [true, true, true, true, true, true, true],
    9: [true, true, true, true, false, true, true],
  };
  const segs = map[v] || map[0];
  const onColor = '#fbbf24';
  const offColor = '#27272a';

  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.16, 0.032, 0.01]} />
        <meshBasicMaterial color={segs[0] ? onColor : offColor} />
      </mesh>
      <mesh position={[0.08, 0.08, 0]}>
        <boxGeometry args={[0.032, 0.14, 0.01]} />
        <meshBasicMaterial color={segs[1] ? onColor : offColor} />
      </mesh>
      <mesh position={[0.08, -0.08, 0]}>
        <boxGeometry args={[0.032, 0.14, 0.01]} />
        <meshBasicMaterial color={segs[2] ? onColor : offColor} />
      </mesh>
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[0.16, 0.032, 0.01]} />
        <meshBasicMaterial color={segs[3] ? onColor : offColor} />
      </mesh>
      <mesh position={[-0.08, -0.08, 0]}>
        <boxGeometry args={[0.032, 0.14, 0.01]} />
        <meshBasicMaterial color={segs[4] ? onColor : offColor} />
      </mesh>
      <mesh position={[-0.08, 0.08, 0]}>
        <boxGeometry args={[0.032, 0.14, 0.01]} />
        <meshBasicMaterial color={segs[5] ? onColor : offColor} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.16, 0.032, 0.01]} />
        <meshBasicMaterial color={segs[6] ? onColor : offColor} />
      </mesh>
    </group>
  );
};

// Retro gymnasium electronic wall scoreboard
const RetroScoreboard: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  p1Score: number;
  p2Score: number;
}> = ({ position, rotationY = 0, p1Score, p2Score }) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 1.3, 0.12]} />
        <meshLambertMaterial color="#27272a" flatShading />
      </mesh>
      <mesh position={[0, 0, 0.062]}>
        <boxGeometry args={[2.3, 1.2, 0.01]} />
        <meshBasicMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.22, 0.07]}>
        <boxGeometry args={[2.1, 0.65, 0.01]} />
        <meshBasicMaterial color="#18181b" />
      </mesh>

      <group position={[-0.55, 0.22, 0.08]}>
        <group position={[-0.13, 0, 0]}>
          <SevenSegmentDigit value={Math.floor(p1Score / 10)} />
        </group>
        <group position={[0.13, 0, 0]}>
          <SevenSegmentDigit value={p1Score % 10} />
        </group>
      </group>

      <mesh position={[0, 0.22, 0.08]}>
        <boxGeometry args={[0.12, 0.04, 0.01]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>

      <group position={[0.55, 0.22, 0.08]}>
        <group position={[-0.13, 0, 0]}>
          <SevenSegmentDigit value={Math.floor(p2Score / 10)} />
        </group>
        <group position={[0.13, 0, 0]}>
          <SevenSegmentDigit value={p2Score % 10} />
        </group>
      </group>

      {[-0.6, -0.4, -0.2, 0.2, 0.4, 0.6].map((dx, i) => (
        <mesh key={`led-${i}`} position={[dx, -0.25, 0.075]}>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
          <meshBasicMaterial color={i % 2 === 0 ? '#ea580c' : '#71717a'} />
        </mesh>
      ))}
    </group>
  );
};

export const TableScene: React.FC<TableSceneProps> = ({
  ball,
  p1Paddle,
  p2Paddle,
  localSlot,
  localPaddlePos,
  score = { p1: 0, p2: 0 },
  showBallIndicator = true,
  handedness = 'right',
  screenJuice = 'subtle',
  onSmashShake
}) => {
  const ballMeshRef = useRef<THREE.Mesh>(null);
  const blobShadowRef = useRef<THREE.Mesh>(null);
  const paddleShadowRef = useRef<THREE.Mesh>(null);
  const paddleShadowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const p1MeshRef = useRef<THREE.Group>(null);
  const p2MeshRef = useRef<THREE.Group>(null);

  // Ball arrival indicator refs
  const strikeTargetRef = useRef<THREE.Group>(null);
  const contractingRingRef = useRef<THREE.Mesh>(null);
  const targetMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const bounceRingRef = useRef<THREE.Group>(null);

  // Serve trajectory guide refs
  const serveArcRef = useRef<THREE.Group>(null);
  const serveArcDotsRef = useRef<Array<THREE.Mesh | null>>([]);
  const serveBaseTargetRef = useRef<THREE.Mesh>(null);

  // Ball trail positions
  const trailCount = 5;
  const trailRefs = useRef<Array<THREE.Mesh | null>>([]);
  const ballHistory = useRef<Array<{ x: number; y: number; z: number }>>([]);

  const currentBallPos = useRef({ x: ball.pos.x, y: ball.pos.y, z: ball.pos.z });

  // Local paddle recoil on hit
  const paddleRecoilRef = useRef(0);

  // Particle pool for visual hit juice
  const particlesRef = useRef<ParticleData[]>([]);
  const particleMeshesRef = useRef<Array<THREE.Mesh | null>>([]);

  // Procedural voxel net texture with square holes
  const netTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 32, 32);
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, 28, 28);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(36, 4);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }, []);

  // Listen to network game events for hit juice & recoil
  useEffect(() => {
    const unsub = network.onEvent((event) => {
      if (event.type === 'PADDLE_HIT') {
        const hitPos = event.payload?.pos || currentBallPos.current;
        const isSmash = !!event.payload?.isSmash;

        // If local player hit, trigger local recoil
        if (event.payload?.player === localSlot) {
          paddleRecoilRef.current = isSmash ? 0.055 : 0.038;
        }

        // Trigger camera shake on smash
        if (isSmash && screenJuice !== 'off') {
          onSmashShake?.();
        }

        // Spawn voxel spark particles
        const count = isSmash ? 8 : 5;
        for (let i = 0; i < count; i++) {
          particlesRef.current.push({
            x: hitPos.x,
            y: hitPos.y,
            z: hitPos.z,
            vx: (Math.random() - 0.5) * 2.8,
            vy: 0.8 + Math.random() * 2.2,
            vz: (Math.random() - 0.5) * 2.8,
            life: 0.35,
            maxLife: 0.35,
            color: isSmash ? '#ff9800' : '#ffffff'
          });
        }
      } else if (event.type === 'TABLE_BOUNCE') {
        const hitPos = event.payload?.pos || currentBallPos.current;
        for (let i = 0; i < 4; i++) {
          particlesRef.current.push({
            x: hitPos.x,
            y: hitPos.y + 0.01,
            z: hitPos.z,
            vx: (Math.random() - 0.5) * 1.5,
            vy: 0.5 + Math.random() * 1.2,
            vz: (Math.random() - 0.5) * 1.5,
            life: 0.25,
            maxLife: 0.25,
            color: '#cbd5e1'
          });
        }
      }
    });

    return () => unsub();
  }, [localSlot, screenJuice, onSmashShake]);

  useFrame((_, delta) => {
    const snap = network.latestSnapshot;
    const targetBall = snap ? snap.ball : ball;
    const targetP1 = snap ? snap.p1Paddle : p1Paddle;
    const targetP2 = snap ? snap.p2Paddle : p2Paddle;

    // Discontinuity snap to eliminate lag on paddle hit
    const distDiff = Math.hypot(
      targetBall.pos.x - currentBallPos.current.x,
      targetBall.pos.y - currentBallPos.current.y,
      targetBall.pos.z - currentBallPos.current.z
    );

    if (distDiff > 0.15) {
      currentBallPos.current.x = targetBall.pos.x;
      currentBallPos.current.y = targetBall.pos.y;
      currentBallPos.current.z = targetBall.pos.z;
    } else {
      const lerpFactor = Math.min(1.0, delta * 45);
      currentBallPos.current.x += (targetBall.pos.x - currentBallPos.current.x) * lerpFactor;
      currentBallPos.current.y += (targetBall.pos.y - currentBallPos.current.y) * lerpFactor;
      currentBallPos.current.z += (targetBall.pos.z - currentBallPos.current.z) * lerpFactor;
    }

    const bPos = currentBallPos.current;

    // Update ball mesh position
    if (ballMeshRef.current) {
      ballMeshRef.current.position.set(bPos.x, bPos.y, bPos.z);
    }

    // Update ball shadow on table
    if (blobShadowRef.current) {
      const isOverTable =
        Math.abs(bPos.x) <= TABLE_DIMENSIONS.halfWidth &&
        Math.abs(bPos.z) <= TABLE_DIMENSIONS.halfLength;

      if (isOverTable && bPos.y >= TABLE_DIMENSIONS.height) {
        blobShadowRef.current.visible = true;
        blobShadowRef.current.position.set(bPos.x, TABLE_DIMENSIONS.height + 0.002, bPos.z);
        const heightAbove = bPos.y - TABLE_DIMENSIONS.height;
        const scale = Math.max(0.4, 1.2 - heightAbove * 0.7);
        blobShadowRef.current.scale.set(scale, scale, 1);
      } else {
        blobShadowRef.current.visible = false;
      }
    }

    // Update ball trail buffer
    if (ballHistory.current.length < trailCount * 2) {
      for (let i = ballHistory.current.length; i < trailCount * 2; i++) {
        ballHistory.current.push({ x: bPos.x, y: bPos.y, z: bPos.z });
      }
    } else {
      for (let i = ballHistory.current.length - 1; i > 0; i--) {
        ballHistory.current[i].x = ballHistory.current[i - 1].x;
        ballHistory.current[i].y = ballHistory.current[i - 1].y;
        ballHistory.current[i].z = ballHistory.current[i - 1].z;
      }
      ballHistory.current[0].x = bPos.x;
      ballHistory.current[0].y = bPos.y;
      ballHistory.current[0].z = bPos.z;
    }

    trailRefs.current.forEach((mesh, idx) => {
      if (mesh) {
        const histItem = ballHistory.current[(idx + 1) * 2];
        if (histItem) {
          mesh.visible = true;
          mesh.position.set(histItem.x, histItem.y, histItem.z);
        } else {
          mesh.visible = false;
        }
      }
    });

    // Decay local paddle recoil
    paddleRecoilRef.current = Math.max(0, paddleRecoilRef.current - delta * 0.30);
    const recoilOffset = paddleRecoilRef.current * (localSlot === 'p1' ? 1 : -1);

    // Update P1 Paddle
    if (p1MeshRef.current) {
      if (localSlot === 'p1') {
        p1MeshRef.current.position.set(
          localPaddlePos.x,
          localPaddlePos.y,
          1.62 - localPaddlePos.swingZ + recoilOffset
        );
        p1MeshRef.current.rotation.set(
          localPaddlePos.pitch,
          localPaddlePos.yaw,
          localPaddlePos.roll
        );
      } else {
        p1MeshRef.current.position.set(targetP1.pos.x, targetP1.pos.y, targetP1.pos.z);
        p1MeshRef.current.rotation.set(targetP1.pitch, targetP1.yaw, targetP1.roll);
      }
    }

    // Update P2 Paddle
    if (p2MeshRef.current) {
      if (localSlot === 'p2') {
        p2MeshRef.current.position.set(
          localPaddlePos.x,
          localPaddlePos.y,
          -1.62 + localPaddlePos.swingZ + recoilOffset
        );
        p2MeshRef.current.rotation.set(
          -localPaddlePos.pitch,
          -localPaddlePos.yaw,
          -localPaddlePos.roll
        );
      } else {
        p2MeshRef.current.position.set(targetP2.pos.x, targetP2.pos.y, targetP2.pos.z);
        p2MeshRef.current.rotation.set(-targetP2.pitch, -targetP2.yaw, -targetP2.roll);
      }
    }

    // Update Paddle Shadow on Table (Section 3: Depth indicator)
    if (paddleShadowRef.current && paddleShadowMatRef.current) {
      const pZ = localSlot === 'p1' ? 1.62 - localPaddlePos.swingZ : -1.62 + localPaddlePos.swingZ;
      const isNearTableZ = Math.abs(pZ) <= TABLE_DIMENSIONS.halfLength + 0.35;
      const isNearTableX = Math.abs(localPaddlePos.x) <= TABLE_DIMENSIONS.halfWidth + 0.35;
      const heightAbove = localPaddlePos.y - TABLE_DIMENSIONS.height;

      if (isNearTableZ && isNearTableX && heightAbove > -0.15 && heightAbove < 0.65) {
        paddleShadowRef.current.visible = true;
        paddleShadowRef.current.position.set(localPaddlePos.x, TABLE_DIMENSIONS.height + 0.002, pZ);
        const shadowOpacity = Math.max(0.08, 0.40 * (1 - Math.max(0, heightAbove) / 0.65));
        paddleShadowMatRef.current.opacity = shadowOpacity;
      } else {
        paddleShadowRef.current.visible = false;
      }
    }

    // Update Particles
    if (particlesRef.current.length > 0) {
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.life -= delta;
        p.vy -= 9.8 * delta;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
        }
      }
    }

    // Update particle meshes
    particleMeshesRef.current.forEach((mesh, idx) => {
      if (!mesh) return;
      const p = particlesRef.current[idx];
      if (p) {
        mesh.visible = true;
        mesh.position.set(p.x, p.y, p.z);
        const s = Math.max(0.005, (p.life / p.maxLife) * 0.025);
        mesh.scale.set(s, s, s);
      } else {
        mesh.visible = false;
      }
    });

    // UPDATE BALL ARRIVAL CIRCLE INDICATORS (Section 4)
    if (showBallIndicator) {
      const targetPlaneZ = localSlot === 'p1' ? 1.55 : -1.55;
      const isApproaching =
        (localSlot === 'p1' && targetBall.velocity.z > 0.4) ||
        (localSlot === 'p2' && targetBall.velocity.z < -0.4);

      if (isApproaching && bPos.y > 0.4) {
        const simDt = 0.016;
        let sx = bPos.x;
        let sy = bPos.y;
        let sz = bPos.z;
        let svx = targetBall.velocity.x;
        let svy = targetBall.velocity.y;
        let svz = targetBall.velocity.z;

        let bPoint: { x: number; y: number; z: number } | null = null;
        let tPoint: { x: number; y: number; z: number } | null = null;
        let timeRemaining = 0;

        for (let i = 0; i < 75; i++) {
          svy -= BALL_PHYSICS.gravity * simDt;
          const nextY = sy + svy * simDt;
          const nextX = sx + svx * simDt;
          const nextZ = sz + svz * simDt;

          const tableTop = TABLE_DIMENSIONS.height + BALL_PHYSICS.radius;
          if (sy >= tableTop && nextY <= tableTop && svy < 0) {
            if (
              Math.abs(nextX) <= TABLE_DIMENSIONS.halfWidth &&
              Math.abs(nextZ) <= TABLE_DIMENSIONS.halfLength
            ) {
              if (!bPoint) {
                bPoint = { x: nextX, y: TABLE_DIMENSIONS.height + 0.003, z: nextZ };
              }
              svy = -svy * BALL_PHYSICS.tableRestitution;
            }
          }

          const crossed =
            localSlot === 'p1'
              ? (sz <= targetPlaneZ && nextZ >= targetPlaneZ)
              : (sz >= targetPlaneZ && nextZ <= targetPlaneZ);

          if (crossed) {
            tPoint = {
              x: Math.max(PADDLE_PHYSICS.minX, Math.min(PADDLE_PHYSICS.maxX, nextX)),
              y: Math.max(PADDLE_PHYSICS.minY, Math.min(PADDLE_PHYSICS.maxY, nextY)),
              z: targetPlaneZ
            };
            timeRemaining = i * simDt;
            break;
          }

          sx = nextX;
          sy = nextY;
          sz = nextZ;
        }

        if (tPoint && strikeTargetRef.current) {
          strikeTargetRef.current.visible = true;
          strikeTargetRef.current.position.set(tPoint.x, tPoint.y, tPoint.z);
          strikeTargetRef.current.rotation.y = localSlot === 'p1' ? 0 : Math.PI;

          if (contractingRingRef.current) {
            const scaleFactor = 1.0 + Math.min(2.2, timeRemaining * 2.8);
            contractingRingRef.current.scale.set(scaleFactor, scaleFactor, 1);
          }

          const distToPaddle = Math.hypot(
            localPaddlePos.x - tPoint.x,
            localPaddlePos.y - tPoint.y
          );
          const isAligned = distToPaddle <= PADDLE_PHYSICS.hitToleranceRadius;
          if (targetMaterialRef.current) {
            targetMaterialRef.current.color.set(isAligned ? '#76ff03' : '#00e676');
          }
        } else if (strikeTargetRef.current) {
          strikeTargetRef.current.visible = false;
        }

        if (bPoint && bounceRingRef.current) {
          bounceRingRef.current.visible = true;
          bounceRingRef.current.position.set(bPoint.x, bPoint.y, bPoint.z);
        } else if (bounceRingRef.current) {
          bounceRingRef.current.visible = false;
        }
      } else {
        if (strikeTargetRef.current) strikeTargetRef.current.visible = false;
        if (bounceRingRef.current) bounceRingRef.current.visible = false;
      }
    } else {
      if (strikeTargetRef.current) strikeTargetRef.current.visible = false;
      if (bounceRingRef.current) bounceRingRef.current.visible = false;
    }

    // UPDATE SERVE TRAJECTORY ARC PREVIEW & BALL TABLE TARGET
    const isPhaseServing = snap ? snap.phase === 'SERVING' : false;
    const isLocalServer = snap ? snap.serverSlot === localSlot : true;

    if (isPhaseServing && serveBaseTargetRef.current) {
      serveBaseTargetRef.current.visible = true;
      serveBaseTargetRef.current.position.set(bPos.x, TABLE_DIMENSIONS.height + 0.002, bPos.z);
    } else if (serveBaseTargetRef.current) {
      serveBaseTargetRef.current.visible = false;
    }

    if (isPhaseServing && isLocalServer && serveArcRef.current) {
      serveArcRef.current.visible = true;
      const dirZ = localSlot === 'p1' ? -1 : 1;
      const aimYaw = localSlot === 'p1' ? localPaddlePos.yaw : -localPaddlePos.yaw;
      const forwardSpeed = 4.3;
      let svx = Math.sin(aimYaw) * forwardSpeed;
      let svz = dirZ * Math.cos(aimYaw) * forwardSpeed;
      let svy = -1.15;
      let sx = bPos.x;
      let sy = bPos.y;
      let sz = bPos.z;
      const simDt = 0.022;
      const tableY = TABLE_DIMENSIONS.height + BALL_PHYSICS.radius;

      serveArcDotsRef.current.forEach((dotMesh) => {
        if (!dotMesh) return;
        for (let s = 0; s < 2; s++) {
          svy -= BALL_PHYSICS.gravity * simDt;
          const nextY = sy + svy * simDt;
          const nextX = sx + svx * simDt;
          const nextZ = sz + svz * simDt;

          if (sy >= tableY && nextY <= tableY && svy < 0) {
            if (
              Math.abs(nextX) <= TABLE_DIMENSIONS.halfWidth &&
              Math.abs(nextZ) <= TABLE_DIMENSIONS.halfLength
            ) {
              svy = -svy * BALL_PHYSICS.tableRestitution;
              svx *= 0.98;
              svz *= 0.98;
            }
          }
          sx = nextX;
          sy = nextY;
          sz = nextZ;
        }

        dotMesh.visible = true;
        dotMesh.position.set(sx, sy, sz);
      });
    } else if (serveArcRef.current) {
      serveArcRef.current.visible = false;
    }
  });

  const tableTopY = TABLE_DIMENSIONS.height - 0.025;

  return (
    <group>
      {/* 1. STAGE SPOTLIGHT ON TABLE & CONTROLLED ARENA LIGHTING (Section 4) */}
      <ambientLight intensity={0.55} color="#cbd5e1" />
      {/* High-intensity direct spotlight focused on table surface */}
      <spotLight
        position={[0, 5.8, 0]}
        intensity={2.8}
        angle={0.65}
        penumbra={0.35}
        color="#ffffff"
      />
      <directionalLight position={[0, 6, 2]} intensity={0.8} color="#f8fafc" />
      <directionalLight position={[-4, 5, -2]} intensity={0.4} color="#94a3b8" />

      {/* 2. MUTED DARK SPORTS ARENA FLOOR (Section 4: Dimmed surroundings for contrast) */}
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 22]} />
        <meshLambertMaterial color="#141923" flatShading />
      </mesh>

      {/* 3. COURT BARRIERS SURROUNDING THE ARENA (Dark Navy) */}
      <mesh position={[0, 0.38, -3.4]}>
        <boxGeometry args={[6.2, 0.76, 0.12]} />
        <meshLambertMaterial color="#0e1626" flatShading />
      </mesh>
      <mesh position={[0, 0.38, 3.4]}>
        <boxGeometry args={[6.2, 0.76, 0.12]} />
        <meshLambertMaterial color="#0e1626" flatShading />
      </mesh>
      <mesh position={[-3.1, 0.38, 0]}>
        <boxGeometry args={[0.12, 0.76, 6.8]} />
        <meshLambertMaterial color="#0e1626" flatShading />
      </mesh>
      <mesh position={[3.1, 0.38, 0]}>
        <boxGeometry args={[0.12, 0.76, 6.8]} />
        <meshLambertMaterial color="#0e1626" flatShading />
      </mesh>

      {/* 4. TOURNAMENT TABLE TENNIS TABLE (BRIGHT GREEN SURFACE #00a859) */}
      <mesh position={[0, tableTopY, 0]}>
        <boxGeometry args={[TABLE_DIMENSIONS.width, 0.05, TABLE_DIMENSIONS.length]} />
        <meshLambertMaterial color="#00a859" flatShading />
      </mesh>

      {/* White Boundary Lines */}
      <mesh position={[-TABLE_DIMENSIONS.halfWidth + 0.012, TABLE_DIMENSIONS.height + 0.001, 0]}>
        <boxGeometry args={[0.024, 0.002, TABLE_DIMENSIONS.length]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[TABLE_DIMENSIONS.halfWidth - 0.012, TABLE_DIMENSIONS.height + 0.001, 0]}>
        <boxGeometry args={[0.024, 0.002, TABLE_DIMENSIONS.length]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, TABLE_DIMENSIONS.height + 0.001, -TABLE_DIMENSIONS.halfLength + 0.012]}>
        <boxGeometry args={[TABLE_DIMENSIONS.width, 0.002, 0.024]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, TABLE_DIMENSIONS.height + 0.001, TABLE_DIMENSIONS.halfLength - 0.012]}>
        <boxGeometry args={[TABLE_DIMENSIONS.width, 0.002, 0.024]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, TABLE_DIMENSIONS.height + 0.001, 0]}>
        <boxGeometry args={[0.006, 0.002, TABLE_DIMENSIONS.length]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Metal Table Legs & Under-Frame */}
      {[
        [-0.55, 0.36, -0.95],
        [0.55, 0.36, -0.95],
        [-0.55, 0.36, 0.95],
        [0.55, 0.36, 0.95]
      ].map(([lx, ly, lz], i) => (
        <mesh key={`leg-${i}`} position={[lx, ly, lz]}>
          <boxGeometry args={[0.07, 0.72, 0.07]} />
          <meshLambertMaterial color="#1e293b" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.36, -0.95]}>
        <boxGeometry args={[1.15, 0.05, 0.05]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>
      <mesh position={[0, 0.36, 0.95]}>
        <boxGeometry args={[1.15, 0.05, 0.05]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[TABLE_DIMENSIONS.width - 0.1, 0.04, TABLE_DIMENSIONS.length - 0.1]} />
        <meshLambertMaterial color="#0f172a" flatShading />
      </mesh>

      {/* 5. VOXEL SQUARE GRID NET WITH CLAMPS */}
      <mesh position={[0, TABLE_DIMENSIONS.height + NET_DIMENSIONS.height / 2, 0]}>
        <boxGeometry args={[NET_DIMENSIONS.width, NET_DIMENSIONS.height, 0.008]} />
        <meshLambertMaterial
          map={netTexture}
          transparent
          opacity={0.92}
          color="#3f3f46"
          flatShading
        />
      </mesh>
      <mesh position={[0, NET_DIMENSIONS.topY - 0.006, 0]}>
        <boxGeometry args={[NET_DIMENSIONS.width + 0.02, 0.016, 0.014]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-NET_DIMENSIONS.width / 2, TABLE_DIMENSIONS.height + NET_DIMENSIONS.height / 2, 0]}>
        <boxGeometry args={[0.035, NET_DIMENSIONS.height + 0.03, 0.035]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>
      <mesh position={[NET_DIMENSIONS.width / 2, TABLE_DIMENSIONS.height + NET_DIMENSIONS.height / 2, 0]}>
        <boxGeometry args={[0.035, NET_DIMENSIONS.height + 0.03, 0.035]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>

      {/* 6. SPECTATOR BENCHES */}
      <group position={[0, 0.45, -5.8]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[9.5, 0.06, 0.45]} />
          <meshLambertMaterial color="#4a3b2c" flatShading />
        </mesh>
        <mesh position={[0, 0.45, -0.65]}>
          <boxGeometry args={[9.5, 0.06, 0.45]} />
          <meshLambertMaterial color="#4a3b2c" flatShading />
        </mesh>
        {[-3.5, -1.2, 1.2, 3.5].map((bx, i) => (
          <group key={`bench-leg-${i}`} position={[bx, 0, 0]}>
            <mesh position={[0, -0.22, 0]}>
              <boxGeometry args={[0.06, 0.45, 0.06]} />
              <meshLambertMaterial color="#1e293b" flatShading />
            </mesh>
            <mesh position={[0, 0.0, -0.65]}>
              <boxGeometry args={[0.06, 0.90, 0.06]} />
              <meshLambertMaterial color="#1e293b" flatShading />
            </mesh>
          </group>
        ))}
      </group>

      {/* 7. DIMMED ARENA WALLS (Section 4) */}
      <group position={[0, 3.2, -7.5]}>
        <mesh>
          <planeGeometry args={[18, 6.5]} />
          <meshLambertMaterial color="#18202e" />
        </mesh>
        <mesh position={[0, 0.8, 0.01]}>
          <planeGeometry args={[18, 0.28]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
        <mesh position={[0, 0.5, 0.01]}>
          <planeGeometry args={[18, 0.28]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
        {[-4.5, -1.8, 1.8, 4.5].map((px, i) => (
          <mesh key={`pillar-${i}`} position={[px, 0, 0.06]}>
            <boxGeometry args={[0.18, 6.5, 0.12]} />
            <meshLambertMaterial color="#1e293b" flatShading />
          </mesh>
        ))}
      </group>

      <group position={[0, 3.2, 7.5]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <planeGeometry args={[18, 6.5]} />
          <meshLambertMaterial color="#18202e" />
        </mesh>
        <mesh position={[0, 0.8, 0.01]}>
          <planeGeometry args={[18, 0.28]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
        <mesh position={[0, 0.5, 0.01]}>
          <planeGeometry args={[18, 0.28]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      </group>

      <mesh position={[-7.5, 3.2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[16, 6.5]} />
        <meshLambertMaterial color="#18202e" />
      </mesh>
      <mesh position={[7.5, 3.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[16, 6.5]} />
        <meshLambertMaterial color="#18202e" />
      </mesh>

      {/* 8. RETRO DIGITAL WALL SCOREBOARDS */}
      <RetroScoreboard
        position={[0, 4.4, -7.45]}
        p1Score={score.p1}
        p2Score={score.p2}
      />
      <RetroScoreboard
        position={[0, 4.4, 7.45]}
        rotationY={Math.PI}
        p1Score={score.p1}
        p2Score={score.p2}
      />

      {/* 9. OPPONENT AVATAR ACROSS THE TABLE (Fully visible, standing ready) */}
      {localSlot === 'p1' ? (
        <OpponentAvatar
          position={[0, 0, -2.15]}
          rotationY={0}
          shirtColor="#2563eb"
          paddleX={p2Paddle.pos.x}
          paddleY={p2Paddle.pos.y}
        />
      ) : (
        <OpponentAvatar
          position={[0, 0, 2.15]}
          rotationY={Math.PI}
          shirtColor="#dc2626"
          paddleX={p1Paddle.pos.x}
          paddleY={p1Paddle.pos.y}
        />
      )}

      {/* 10. LOCAL & REMOTE PADDLE MESHES */}
      {/* Player 1 Paddle */}
      <group ref={p1MeshRef} position={[0, 0.95, 1.62]}>
        {localSlot === 'p1' ? (
          <UnifiedLocalPaddleAndArm
            rubberColor="#dc2626"
            shirtColor="#dc2626"
            handedness={handedness}
          />
        ) : (
          <VoxelPaddleMesh rubberColor="#dc2626" />
        )}
      </group>

      {/* Player 2 Paddle */}
      <group ref={p2MeshRef} position={[0, 0.95, -1.62]}>
        {localSlot === 'p2' ? (
          <UnifiedLocalPaddleAndArm
            rubberColor="#2563eb"
            shirtColor="#2563eb"
            handedness={handedness}
          />
        ) : (
          <VoxelPaddleMesh rubberColor="#2563eb" />
        )}
      </group>

      {/* Paddle Shadow on Table Surface (Section 3: Intuitive depth perception) */}
      <mesh
        ref={paddleShadowRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, TABLE_DIMENSIONS.height + 0.002, 0]}
        visible={false}
      >
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial
          ref={paddleShadowMatRef}
          color="#00220c"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>

      {/* 11. UNLIT VIBRANT ORANGE VOXEL BALL (Section 4: High contrast unlit material) */}
      <mesh ref={ballMeshRef} position={[0, 1.0, 0]}>
        <boxGeometry args={[0.048, 0.048, 0.048]} />
        <meshBasicMaterial color="#ff8c00" />
      </mesh>

      {/* Ball Blob Shadow on Table */}
      <mesh ref={blobShadowRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[0.045, 16]} />
        <meshBasicMaterial color="#00220c" transparent opacity={0.65} depthWrite={false} />
      </mesh>

      {/* 12. BALL TRAILS (Section 4: Speed and direction cues) */}
      {Array.from({ length: trailCount }).map((_, idx) => (
        <mesh
          key={`trail-${idx}`}
          ref={(el) => (trailRefs.current[idx] = el)}
          visible={false}
        >
          <boxGeometry args={[0.038 - idx * 0.004, 0.038 - idx * 0.004, 0.038 - idx * 0.004]} />
          <meshBasicMaterial
            color="#ff9e22"
            transparent
            opacity={Math.max(0.08, 0.55 - idx * 0.10)}
          />
        </mesh>
      ))}

      {/* 13. VOXEL PARTICLES POOL (Section 5: Hit feedback juice) */}
      {Array.from({ length: 16 }).map((_, idx) => (
        <mesh
          key={`part-${idx}`}
          ref={(el) => (particleMeshesRef.current[idx] = el)}
          visible={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      ))}

      {/* 14. BALL ARRIVAL RING & PREDICTED TABLE BOUNCE RING (Section 4) */}
      <group ref={strikeTargetRef} visible={false}>
        {/* Outer Contracting Ring */}
        <mesh ref={contractingRingRef}>
          <ringGeometry args={[0.09, 0.105, 24]} />
          <meshBasicMaterial
            ref={targetMaterialRef}
            color="#00e676"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Inner Bullseye Ring */}
        <mesh>
          <ringGeometry args={[0.03, 0.045, 24]} />
          <meshBasicMaterial color="#00e676" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Predicted Table Bounce Marker */}
      <group ref={bounceRingRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <mesh>
          <ringGeometry args={[0.045, 0.065, 20]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.015, 12]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* 15. SERVE POSITION TARGET ON TABLE SURFACE */}
      <mesh
        ref={serveBaseTargetRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, TABLE_DIMENSIONS.height + 0.002, 0]}
        visible={false}
      >
        <ringGeometry args={[0.045, 0.07, 24]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* 16. SERVE TRAJECTORY ARC GUIDE */}
      <group ref={serveArcRef} visible={false}>
        {Array.from({ length: 14 }).map((_, idx) => (
          <mesh
            key={`serve-dot-${idx}`}
            ref={(el) => (serveArcDotsRef.current[idx] = el)}
            visible={false}
          >
            <boxGeometry args={[0.022, 0.022, 0.022]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={Math.max(0.15, 0.90 - idx * 0.05)}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
