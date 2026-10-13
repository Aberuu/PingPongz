import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TABLE_DIMENSIONS, NET_DIMENSIONS, BALL_PHYSICS, PADDLE_PHYSICS } from '@shared/constants';
import type { BallState, PaddleState, PlayerSlot, ScoreState, Handedness, ScreenJuice, CameraPreset, GameMode } from '@shared/types';
import { network } from '../network/socketClient';

interface TableSceneProps {
  ball: BallState;
  p1Paddle: PaddleState;
  p2Paddle: PaddleState;
  localSlot: PlayerSlot;
  localPaddlePos: { x: number; y: number; swingZ: number; pitch: number; yaw: number; roll: number };
  score?: ScoreState;
  showBallIndicator?: boolean;
  showRallyTrajectory?: boolean;
  cameraPreset?: CameraPreset;
  gameMode?: GameMode;
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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Reusable vectors for segment transform to prevent GC allocations
const _vUp = new THREE.Vector3(0, 1, 0);
const _vDir = new THREE.Vector3();

function setSegmentTransform(
  mesh: THREE.Mesh | null,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  baseLength: number
) {
  if (!mesh) return;
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const mz = (az + bz) * 0.5;
  mesh.position.set(mx, my, mz);

  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.max(0.01, Math.hypot(dx, dy, dz));

  _vDir.set(dx / len, dy / len, dz / len);
  mesh.quaternion.setFromUnitVectors(_vUp, _vDir);
  mesh.scale.set(1, len / baseLength, 1);
}

// Paddle mesh with hand grasping the wooden handle
const VoxelPaddleWithHand: React.FC<{
  rubberColor: string;
}> = ({ rubberColor }) => {
  return (
    <group>
      <VoxelPaddleMesh rubberColor={rubberColor} />
      {/* Hand wrapped around the wooden handle */}
      <mesh position={[0, -0.13, 0]}>
        <boxGeometry args={[0.048, 0.085, 0.044]} />
        <meshLambertMaterial color="#f0b78c" flatShading />
      </mesh>
    </group>
  );
};

interface AliveVoxelPlayerProps {
  isLocal: boolean;
  slot: PlayerSlot;
  shirtColor: string;
  localPaddlePos: { x: number; y: number; swingZ: number; pitch: number; yaw: number; roll: number };
  ballPosRef: React.MutableRefObject<{ x: number; y: number; z: number }>;
  baseZ: number;
  facingSign: number; // -1 for P1 facing -Z; +1 for P2 facing +Z
  cameraPreset?: CameraPreset;
  handedness?: Handedness;
  recoilRef?: React.MutableRefObject<number>;
}

// Living, animated 3D voxel table tennis player
const AliveVoxelPlayer: React.FC<AliveVoxelPlayerProps> = ({
  isLocal,
  slot,
  shirtColor,
  localPaddlePos,
  ballPosRef,
  baseZ,
  facingSign,
  cameraPreset = 'ots',
  handedness = 'right',
  recoilRef
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);

  const upperArmRef = useRef<THREE.Mesh>(null);
  const forearmRef = useRef<THREE.Mesh>(null);
  const balanceUpperArmRef = useRef<THREE.Mesh>(null);
  const balanceForearmRef = useRef<THREE.Mesh>(null);

  const leftThighRef = useRef<THREE.Mesh>(null);
  const leftShinRef = useRef<THREE.Mesh>(null);
  const leftFootRef = useRef<THREE.Group>(null);

  const rightThighRef = useRef<THREE.Mesh>(null);
  const rightShinRef = useRef<THREE.Mesh>(null);
  const rightFootRef = useRef<THREE.Group>(null);

  const torsoMatRef = useRef<THREE.MeshLambertMaterial>(null);
  const headMatRef = useRef<THREE.MeshLambertMaterial>(null);
  const hairMatRef = useRef<THREE.MeshLambertMaterial>(null);

  const currentBodyX = useRef(0);
  const currentHeadYaw = useRef(0);
  const currentHeadPitch = useRef(0);
  const baseOpacity = isLocal ? 0.90 : 1.0;
  const currentOpacity = useRef(baseOpacity);

  useFrame((state, delta) => {
    const isRightHand = handedness === 'right';
    const dominantHandSign = isRightHand ? (facingSign === -1 ? 1 : -1) : (facingSign === -1 ? -1 : 1);
    const isFirstPerson = isLocal && cameraPreset === 'first-person';

    // 1. Paddle position determination
    let padX = 0;
    let padY = 0.95;
    let padSwingZ = 0;

    if (isLocal) {
      padX = localPaddlePos.x;
      padY = localPaddlePos.y;
      padSwingZ = localPaddlePos.swingZ || 0;
    } else {
      const snap = network.latestSnapshot;
      if (snap) {
        const p = slot === 'p1' ? snap.p1Paddle : snap.p2Paddle;
        padX = p.pos.x;
        padY = p.pos.y;
        padSwingZ = slot === 'p1' ? Math.max(0, 1.62 - p.pos.z) : Math.max(0, p.pos.z - (-1.62));
      }
    }

    // World paddle handle coordinates
    const padWorldZ = facingSign === -1 ? (1.62 - padSwingZ) : (-1.62 + padSwingZ);
    const padHandleX = padX;
    const padHandleY = padY - 0.12;
    const padHandleZ = padWorldZ;

    // Body lateral placement: offset from dominant hand to keep view open and clear center table
    const targetBodyX = padX * 0.65 - dominantHandSign * 0.28;
    currentBodyX.current += (targetBodyX - currentBodyX.current) * Math.min(1.0, delta * 12);
    const bodyVx = (targetBodyX - currentBodyX.current) * 12;

    const time = state.clock.getElapsedTime();
    // Athletic ready bounce and subtle breathing
    const readyBounce = Math.abs(Math.sin(time * 5.2)) * 0.022;
    const breathBob = Math.sin(time * 2.8) * 0.008;
    const recoil = recoilRef ? recoilRef.current : 0;

    // Line-of-sight (LOS) occlusion test between camera and (ball, table center) per PRD 3.0 Section 2
    if (isLocal) {
      if (isFirstPerson) {
        currentOpacity.current = 0.0;
      } else {
        const camPos = state.camera.position;
        const headWorld = { x: currentBodyX.current, y: 1.15 + readyBounce, z: baseZ };
        const b = ballPosRef.current;

        // Vector from camera to ball
        const abX = b.x - camPos.x;
        const abY = b.y - camPos.y;
        const abZ = b.z - camPos.z;
        const abLenSq = abX * abX + abY * abY + abZ * abZ;

        const apX = headWorld.x - camPos.x;
        const apY = headWorld.y - camPos.y;
        const apZ = headWorld.z - camPos.z;

        const tRay = abLenSq > 0.0001 ? clamp((apX * abX + apY * abY + apZ * abZ) / abLenSq, 0, 1) : 0;
        const cX = camPos.x + tRay * abX;
        const cY = camPos.y + tRay * abY;
        const cZ = camPos.z + tRay * abZ;
        const distToBallRay = Math.hypot(headWorld.x - cX, headWorld.y - cY, headWorld.z - cZ);

        // Vector from camera to table center
        const tcX = 0 - camPos.x;
        const tcY = 0.76 - camPos.y;
        const tcZ = 0 - camPos.z;
        const tcLenSq = tcX * tcX + tcY * tcY + tcZ * tcZ;
        const tTableRay = tcLenSq > 0.0001 ? clamp((apX * tcX + apY * tcY + apZ * tcZ) / tcLenSq, 0, 1) : 0;
        const ctX = camPos.x + tTableRay * tcX;
        const ctY = camPos.y + tTableRay * tcY;
        const ctZ = camPos.z + tTableRay * tcZ;
        const distToTableRay = Math.hypot(headWorld.x - ctX, headWorld.y - ctY, headWorld.z - ctZ);

        // If head or torso intersects line of sight to ball (<0.22m) or table (<0.18m), drop opacity to 0.20
        const isOccluding = distToBallRay < 0.22 || distToTableRay < 0.18;
        const targetOp = isOccluding ? 0.20 : 0.90;
        currentOpacity.current += (targetOp - currentOpacity.current) * Math.min(1.0, delta * 9);
      }
    }

    const op = currentOpacity.current;
    if (rootRef.current && isLocal) {
      rootRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => {
              m.transparent = true;
              m.opacity = op;
            });
          } else if (mat) {
            mat.transparent = true;
            mat.opacity = op;
          }
        }
      });
    }

    // First-person visibility toggle for body parts
    if (headRef.current) headRef.current.visible = !isFirstPerson;
    if (torsoRef.current) torsoRef.current.visible = !isFirstPerson;
    if (balanceUpperArmRef.current) balanceUpperArmRef.current.visible = !isFirstPerson;
    if (balanceForearmRef.current) balanceForearmRef.current.visible = !isFirstPerson;
    if (leftThighRef.current) leftThighRef.current.visible = !isFirstPerson;
    if (leftShinRef.current) leftShinRef.current.visible = !isFirstPerson;
    if (leftFootRef.current) leftFootRef.current.visible = !isFirstPerson;
    if (rightThighRef.current) rightThighRef.current.visible = !isFirstPerson;
    if (rightShinRef.current) rightShinRef.current.visible = !isFirstPerson;
    if (rightFootRef.current) rightFootRef.current.visible = !isFirstPerson;

    if (rootRef.current) {
      rootRef.current.position.set(currentBodyX.current, readyBounce, baseZ);
      rootRef.current.rotation.set(0, facingSign === -1 ? 0 : Math.PI, 0);
    }

    // Local coordinates inside root group:
    // When facing -Z (P1): local forward is -Z, right is +X.
    // When facing +Z (P2 rotated Math.PI): local forward is -Z, right is +X.
    const locPadX = facingSign === -1 ? (padHandleX - currentBodyX.current) : -(padHandleX - currentBodyX.current);
    const locPadY = padHandleY - readyBounce;
    const locPadZ = facingSign === -1 ? (padHandleZ - baseZ) : -(padHandleZ - baseZ);

    // Torso lean and twist towards the ball reach
    if (torsoRef.current) {
      const reachX = isRightHand ? locPadX : -locPadX;
      const torsoRoll = clamp(-reachX * 0.16, -0.22, 0.22);
      const torsoYaw = clamp(locPadX * 0.28, -0.32, 0.32);
      const torsoPitch = 0.15 + padSwingZ * 0.32 - recoil * 0.35;
      torsoRef.current.rotation.set(torsoPitch, torsoYaw, torsoRoll);
    }

    // Dynamic Head ball-tracking
    const b = ballPosRef.current;
    const locBallX = facingSign === -1 ? (b.x - currentBodyX.current) : -(b.x - currentBodyX.current);
    const locBallY = b.y - readyBounce;
    const locBallZ = facingSign === -1 ? (b.z - baseZ) : -(b.z - baseZ);

    const fwdDist = -locBallZ; // positive when ball is forward on court
    let targetHeadYaw = 0;
    let targetHeadPitch = 0;
    if (fwdDist > 0.08) {
      targetHeadYaw = clamp(Math.atan2(locBallX, fwdDist), -0.55, 0.55);
      targetHeadPitch = clamp(Math.atan2(locBallY - 1.15, fwdDist), -0.35, 0.35);
    }
    currentHeadYaw.current += (targetHeadYaw - currentHeadYaw.current) * Math.min(1.0, delta * 14);
    currentHeadPitch.current += (targetHeadPitch - currentHeadPitch.current) * Math.min(1.0, delta * 14);

    if (headRef.current) {
      headRef.current.rotation.set(currentHeadPitch.current, currentHeadYaw.current, 0);
    }

    // Playing arm kinematics (shoulder -> elbow -> paddle handle)
    const shoulderX = isRightHand ? 0.22 : -0.22;
    const shoulderY = 0.94 + breathBob;
    const shoulderZ = -0.06;

    const armDx = locPadX - shoulderX;
    const armDy = locPadY - shoulderY;
    const armDz = locPadZ - shoulderZ;
    const armLen = Math.hypot(armDx, armDy, armDz);

    const elbowFlare = isRightHand ? 0.08 : -0.08;
    const elbowSag = -0.09 * (1.0 - Math.min(1.0, armLen / 0.55));
    const elbowX = shoulderX + armDx * 0.48 + elbowFlare;
    const elbowY = shoulderY + armDy * 0.48 + elbowSag;
    const elbowZ = shoulderZ + armDz * 0.48;

    setSegmentTransform(upperArmRef.current, shoulderX, shoulderY, shoulderZ, elbowX, elbowY, elbowZ, 0.22);
    setSegmentTransform(forearmRef.current, elbowX, elbowY, elbowZ, locPadX, locPadY, locPadZ, 0.22);

    // Non-playing arm counter-balance
    const oSign = isRightHand ? -1 : 1;
    const oShoulderX = oSign * 0.22;
    const oShoulderY = 0.94 + breathBob;
    const oShoulderZ = -0.06;

    const balanceSpread = clamp(-locPadX * 0.16, -0.12, 0.12);
    const oElbowX = oShoulderX + oSign * (0.09 + balanceSpread);
    const oElbowY = oShoulderY - 0.18;
    const oElbowZ = oShoulderZ - 0.10;

    const oHandX = oElbowX - oSign * 0.11;
    const oHandY = oElbowY + 0.12;
    const oHandZ = oElbowZ - 0.12;

    setSegmentTransform(balanceUpperArmRef.current, oShoulderX, oShoulderY, oShoulderZ, oElbowX, oElbowY, oElbowZ, 0.20);
    setSegmentTransform(balanceForearmRef.current, oElbowX, oElbowY, oElbowZ, oHandX, oHandY, oHandZ, 0.18);

    // Stepping feet and legs
    const moveIntensity = Math.min(1.0, Math.abs(bodyVx) * 0.8 + 0.2);
    const stepFreq = time * (Math.abs(bodyVx) > 0.08 ? 12 : 5.2);
    const leftFootLift = Math.max(0, Math.sin(stepFreq)) * 0.028 * moveIntensity;
    const rightFootLift = Math.max(0, Math.cos(stepFreq)) * 0.028 * moveIntensity;

    const leftHipX = -0.13;
    const leftHipY = 0.58;
    const leftHipZ = 0;
    const leftFootX = -0.18;
    const leftFootY = 0.06 + leftFootLift;
    const leftFootZ = -0.04;

    const rightHipX = 0.13;
    const rightHipY = 0.58;
    const rightHipZ = 0;
    const rightFootX = 0.18;
    const rightFootY = 0.06 + rightFootLift;
    const rightFootZ = -0.04;

    // Knees bend slightly forward
    const leftKneeX = (leftHipX + leftFootX) * 0.5 - 0.02;
    const leftKneeY = (leftHipY + leftFootY) * 0.5;
    const leftKneeZ = -0.09;

    const rightKneeX = (rightHipX + rightFootX) * 0.5 + 0.02;
    const rightKneeY = (rightHipY + rightFootY) * 0.5;
    const rightKneeZ = -0.09;

    setSegmentTransform(leftThighRef.current, leftHipX, leftHipY, leftHipZ, leftKneeX, leftKneeY, leftKneeZ, 0.26);
    setSegmentTransform(leftShinRef.current, leftKneeX, leftKneeY, leftKneeZ, leftFootX, leftFootY, leftFootZ, 0.26);
    if (leftFootRef.current) {
      leftFootRef.current.position.set(leftFootX, leftFootY, leftFootZ);
    }

    setSegmentTransform(rightThighRef.current, rightHipX, rightHipY, rightHipZ, rightKneeX, rightKneeY, rightKneeZ, 0.26);
    setSegmentTransform(rightShinRef.current, rightKneeX, rightKneeY, rightKneeZ, rightFootX, rightFootY, rightFootZ, 0.26);
    if (rightFootRef.current) {
      rightFootRef.current.position.set(rightFootX, rightFootY, rightFootZ);
    }
  });

  return (
    <group ref={rootRef}>
      {/* 1. Torso and Hips */}
      <group ref={torsoRef} position={[0, 0.78, 0]}>
        {/* Chest (Team Jersey) */}
        <mesh position={[0, 0.10, 0]}>
          <boxGeometry args={[0.38, 0.32, 0.24]} />
          <meshLambertMaterial
            color={shirtColor}
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        {/* Team Collar / Stripe */}
        <mesh position={[0, 0.24, -0.01]}>
          <boxGeometry args={[0.16, 0.05, 0.25]} />
          <meshLambertMaterial
            color="#ffffff"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        {/* Shorts / Waist */}
        <mesh position={[0, -0.14, 0]}>
          <boxGeometry args={[0.36, 0.18, 0.22]} />
          <meshLambertMaterial
            color="#1e293b"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
      </group>

      {/* 2. Head with Retro Voxel Features & Athletic Headband */}
      <group ref={headRef} position={[0, 1.15, -0.04]}>
        {/* Face */}
        <mesh>
          <boxGeometry args={[0.24, 0.24, 0.24]} />
          <meshLambertMaterial
            color="#f0b78c"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        {/* Hair */}
        <mesh position={[0, 0.08, 0.01]}>
          <boxGeometry args={[0.26, 0.12, 0.26]} />
          <meshLambertMaterial
            color="#4a2c16"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        {/* Athletic Headband */}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.252, 0.045, 0.252]} />
          <meshLambertMaterial
            color="#ffffff"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        {/* Headband Center Accent */}
        <mesh position={[0, 0.04, -0.128]}>
          <boxGeometry args={[0.08, 0.03, 0.01]} />
          <meshLambertMaterial
            color={shirtColor}
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        {/* Retro Voxel Eyes */}
        <mesh position={[-0.055, -0.01, -0.124]}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.055, -0.01, -0.124]}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
      </group>

      {/* 3. Playing Arm */}
      {/* Upper Arm (Shirt Sleeve) */}
      <mesh ref={upperArmRef}>
        <boxGeometry args={[0.11, 0.22, 0.11]} />
        <meshLambertMaterial
          color={shirtColor}
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>
      {/* Forearm (Skin tone) */}
      <mesh ref={forearmRef}>
        <boxGeometry args={[0.09, 0.22, 0.09]} />
        <meshLambertMaterial
          color="#f0b78c"
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>

      {/* 4. Non-Playing Balance Arm */}
      {/* Upper Arm */}
      <mesh ref={balanceUpperArmRef}>
        <boxGeometry args={[0.10, 0.20, 0.10]} />
        <meshLambertMaterial
          color={shirtColor}
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>
      {/* Forearm */}
      <mesh ref={balanceForearmRef}>
        <boxGeometry args={[0.08, 0.18, 0.08]} />
        <meshLambertMaterial
          color="#f0b78c"
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>

      {/* 5. Legs and Feet */}
      {/* Left Thigh (Shorts) */}
      <mesh ref={leftThighRef}>
        <boxGeometry args={[0.12, 0.26, 0.13]} />
        <meshLambertMaterial
          color="#1e293b"
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>
      {/* Left Shin (Skin) */}
      <mesh ref={leftShinRef}>
        <boxGeometry args={[0.10, 0.26, 0.11]} />
        <meshLambertMaterial
          color="#f0b78c"
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>
      {/* Left Sneaker */}
      <group ref={leftFootRef}>
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[0.13, 0.09, 0.22]} />
          <meshLambertMaterial
            color="#f8fafc"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        <mesh position={[0, -0.04, -0.02]}>
          <boxGeometry args={[0.135, 0.02, 0.225]} />
          <meshLambertMaterial color="#0f172a" flatShading />
        </mesh>
      </group>

      {/* Right Thigh (Shorts) */}
      <mesh ref={rightThighRef}>
        <boxGeometry args={[0.12, 0.26, 0.13]} />
        <meshLambertMaterial
          color="#1e293b"
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>
      {/* Right Shin (Skin) */}
      <mesh ref={rightShinRef}>
        <boxGeometry args={[0.10, 0.26, 0.11]} />
        <meshLambertMaterial
          color="#f0b78c"
          flatShading
          transparent={isLocal}
          opacity={baseOpacity}
        />
      </mesh>
      {/* Right Sneaker */}
      <group ref={rightFootRef}>
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[0.13, 0.09, 0.22]} />
          <meshLambertMaterial
            color="#f8fafc"
            flatShading
            transparent={isLocal}
            opacity={baseOpacity}
          />
        </mesh>
        <mesh position={[0, -0.04, -0.02]}>
          <boxGeometry args={[0.135, 0.02, 0.225]} />
          <meshLambertMaterial color="#0f172a" flatShading />
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

// Retro voxel automatic ball machine for solo training mode
const VoxelBallMachine: React.FC = () => {
  return (
    <group position={[0, 0.95, -1.45]}>
      {/* Heavy base stand */}
      <mesh position={[0, -0.45, 0]}>
        <boxGeometry args={[0.35, 0.55, 0.35]} />
        <meshLambertMaterial color="#1e293b" flatShading />
      </mesh>
      {/* Machine main body (arcade amber) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.38, 0.38, 0.42]} />
        <meshLambertMaterial color="#f59e0b" flatShading />
      </mesh>
      {/* Feeding barrel pointing toward table (+Z) */}
      <mesh position={[0, 0.02, 0.22]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.14, 0.14, 0.22]} />
        <meshLambertMaterial color="#0f172a" flatShading />
      </mesh>
      {/* Status LED */}
      <mesh position={[0.12, 0.14, 0.21]}>
        <boxGeometry args={[0.04, 0.04, 0.02]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
    </group>
  );
};

// Retro voxel spectator crowd seated in stadium grandstand tiers
const VoxelSpectatorCrowd: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  rowLength?: number;
  teamColor?: string;
}> = ({ position, rotationY = 0, rowLength = 8, teamColor }) => {
  const spectators = useMemo(() => {
    const palette = teamColor
      ? [teamColor, teamColor, '#ffffff', teamColor, '#1e293b', teamColor]
      : ['#2563eb', '#dc2626', '#f59e0b', '#10b981', '#ffffff', '#64748b', '#3b82f6'];
    const skinTones = ['#f0b78c', '#d49b6a', '#e2a77f', '#eac096'];
    const hairTones = ['#0f172a', '#3b2112', '#1e293b', '#78350f'];

    const items = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < rowLength; c++) {
        if ((r * 11 + c * 7) % 7 === 0) continue;
        items.push({
          row: r,
          col: c,
          shirt: palette[(r * 5 + c * 3) % palette.length],
          skin: skinTones[(r * 3 + c * 2) % skinTones.length],
          hair: hairTones[(r * 2 + c * 5) % hairTones.length],
          leanY: ((c % 3) - 1) * 0.03
        });
      }
    }
    return items;
  }, [teamColor, rowLength]);

  const stepDepth = 0.55;
  const stepHeight = 0.35;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 3-Tier Grandstand Concrete Steps */}
      {[0, 1, 2].map((tier) => (
        <group key={`tier-${tier}`} position={[0, tier * stepHeight, -tier * stepDepth]}>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[rowLength * 0.58 + 0.4, 0.32, stepDepth]} />
            <meshLambertMaterial color="#374151" flatShading />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[rowLength * 0.58 + 0.2, 0.04, stepDepth * 0.7]} />
            <meshLambertMaterial color="#4b5563" flatShading />
          </mesh>
        </group>
      ))}

      {/* Spectator Characters */}
      {spectators.map((s, idx) => {
        const xPos = (s.col - (rowLength - 1) / 2) * 0.58;
        const yPos = s.row * stepHeight + 0.34;
        const zPos = -s.row * stepDepth;

        return (
          <group key={`spec-${idx}`} position={[xPos, yPos, zPos]}>
            <mesh position={[0, 0.10, 0.08]}>
              <boxGeometry args={[0.22, 0.20, 0.24]} />
              <meshLambertMaterial color="#1e293b" flatShading />
            </mesh>
            <mesh position={[0, 0.30 + s.leanY, 0]}>
              <boxGeometry args={[0.24, 0.26, 0.18]} />
              <meshLambertMaterial color={s.shirt} flatShading />
            </mesh>
            <mesh position={[0, 0.51 + s.leanY, 0.02]}>
              <boxGeometry args={[0.16, 0.16, 0.16]} />
              <meshLambertMaterial color={s.skin} flatShading />
            </mesh>
            <mesh position={[0, 0.59 + s.leanY, 0.01]}>
              <boxGeometry args={[0.17, 0.07, 0.17]} />
              <meshLambertMaterial color={s.hair} flatShading />
            </mesh>
          </group>
        );
      })}
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
  showRallyTrajectory = true,
  cameraPreset = 'ots',
  gameMode = 'match',
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

  // Stadium banner textures: FTI (Left / Blue) and UKSW (Right / Red)
  const ftiBannerTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 1024, 512);
    grad.addColorStop(0, '#060d19');
    grad.addColorStop(0.5, '#0b162b');
    grad.addColorStop(1, '#060d19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(37, 99, 235, 0.18)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 1024; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y < 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 14;
    ctx.strokeRect(16, 16, 992, 480);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, 960, 448);

    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('UNIVERSITAS KRISTEN SATYA WACANA', 512, 82);

    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 35;
    ctx.fillStyle = '#1d4ed8';
    ctx.font = '900 210px "Impact", "Arial Black", sans-serif';
    ctx.fillText('FTI', 512, 280);

    ctx.shadowBlur = 15;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('FTI', 512, 276);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '900 204px "Impact", "Arial Black", sans-serif';
    ctx.fillText('FTI', 512, 272);

    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(112, 320, 800, 64);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(112, 320, 800, 64);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('FAKULTAS TEKNOLOGI INFORMASI', 512, 362);

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('LAN ARENA CHAMPIONSHIP | SALATIGA', 512, 435);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const ukswBannerTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 1024, 512);
    grad.addColorStop(0, '#180608');
    grad.addColorStop(0.5, '#280a0e');
    grad.addColorStop(1, '#180608');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(220, 38, 38, 0.18)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 1024; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y < 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 14;
    ctx.strokeRect(16, 16, 992, 480);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, 960, 448);

    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EST. 1956 | SALATIGA, JAWA TENGAH', 512, 82);

    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 35;
    ctx.fillStyle = '#991b1b';
    ctx.font = '900 190px "Impact", "Arial Black", sans-serif';
    ctx.fillText('UKSW', 512, 280);

    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ef4444';
    ctx.fillText('UKSW', 512, 276);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fee2e2';
    ctx.font = '900 184px "Impact", "Arial Black", sans-serif';
    ctx.fillText('UKSW', 512, 272);

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(72, 320, 880, 64);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 3;
    ctx.strokeRect(72, 320, 880, 64);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('UNIVERSITAS KRISTEN SATYA WACANA', 512, 362);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('SATYA WACANA CHRISTIAN UNIVERSITY | ARENA', 512, 435);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
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

    return () => {
      unsub();
    };
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
    // UPDATE BALL TRAJECTORY ARC PREVIEW & BALL TABLE TARGET
    // Maintained during BOTH serve and active match gameplay
    const isPhaseServing = snap ? snap.phase === 'SERVING' : false;
    const isPhaseRally = snap ? (snap.phase === 'RALLY' || snap.phase === 'POINT_SCORED' || snap.phase === 'COUNTDOWN') : false;
    const isLocalServer = snap ? snap.serverSlot === localSlot : true;

    if (isPhaseServing && serveBaseTargetRef.current) {
      serveBaseTargetRef.current.visible = true;
      serveBaseTargetRef.current.position.set(bPos.x, TABLE_DIMENSIONS.height + 0.002, bPos.z);
    } else if (serveBaseTargetRef.current) {
      serveBaseTargetRef.current.visible = false;
    }

    if (serveArcRef.current) {
      let activeArc = false;
      let svx = 0;
      let svy = 0;
      let svz = 0;
      let sx = bPos.x;
      let sy = bPos.y;
      let sz = bPos.z;

      if (isPhaseServing && isLocalServer) {
        activeArc = true;
        const dirZ = localSlot === 'p1' ? -1 : 1;
        const forwardSpeed = 4.3;
        svx = -Math.sin(localPaddlePos.yaw) * forwardSpeed;
        svz = dirZ * Math.cos(localPaddlePos.yaw) * forwardSpeed;
        svy = -1.15;
      } else if (showRallyTrajectory && isPhaseRally && (Math.abs(targetBall.velocity.z) > 0.25 || Math.abs(targetBall.velocity.x) > 0.25)) {
        activeArc = true;
        svx = targetBall.velocity.x;
        svy = targetBall.velocity.y;
        svz = targetBall.velocity.z;
      }

      if (activeArc) {
        serveArcRef.current.visible = true;
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
      } else {
        serveArcRef.current.visible = false;
      }
    }
  });

  const tableTopY = TABLE_DIMENSIONS.height - 0.025;

  return (
    <group>
      {/* 1. BRIGHT STADIUM CHAMPIONSHIP LIGHTING */}
      <ambientLight intensity={1.25} color="#f8fafc" />
      {/* High-intensity direct spotlight focused on table surface */}
      <spotLight
        position={[0, 6.2, 0]}
        intensity={3.4}
        angle={0.85}
        penumbra={0.35}
        color="#ffffff"
      />
      <directionalLight position={[0, 8, 3]} intensity={1.3} color="#f8fafc" />
      <directionalLight position={[-5, 7, -2]} intensity={0.9} color="#e0f2fe" />
      <directionalLight position={[5, 7, 2]} intensity={0.9} color="#fee2e2" />

      {/* 2. BRIGHT SPORTS ARENA FLOOR */}
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 22]} />
        <meshLambertMaterial color="#223042" flatShading />
      </mesh>

      {/* 3. COURT BARRIERS SURROUNDING THE ARENA */}
      <group position={[0, 0.38, -3.4]}>
        <mesh>
          <boxGeometry args={[6.2, 0.76, 0.12]} />
          <meshLambertMaterial color="#0e1626" flatShading />
        </mesh>
        <mesh position={[0, 0.385, 0]}>
          <boxGeometry args={[6.22, 0.04, 0.14]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      </group>
      <group position={[0, 0.38, 3.4]}>
        <mesh>
          <boxGeometry args={[6.2, 0.76, 0.12]} />
          <meshLambertMaterial color="#0e1626" flatShading />
        </mesh>
        <mesh position={[0, 0.385, 0]}>
          <boxGeometry args={[6.22, 0.04, 0.14]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      </group>
      {/* Left barrier (FTI Blue Side) */}
      <group position={[-3.1, 0.38, 0]}>
        <mesh>
          <boxGeometry args={[0.12, 0.76, 6.8]} />
          <meshLambertMaterial color="#091424" flatShading />
        </mesh>
        <mesh position={[0, 0.385, 0]}>
          <boxGeometry args={[0.14, 0.04, 6.82]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
      </group>
      {/* Right barrier (UKSW Red Side) */}
      <group position={[3.1, 0.38, 0]}>
        <mesh>
          <boxGeometry args={[0.12, 0.76, 6.8]} />
          <meshLambertMaterial color="#1a080a" flatShading />
        </mesh>
        <mesh position={[0, 0.385, 0]}>
          <boxGeometry args={[0.14, 0.04, 6.82]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
      </group>

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

      {/* 6. STADIUM GRANDSTANDS & SPECTATOR CROWD */}
      {/* Left Grandstand (FTI Blue Supporter Section) */}
      <VoxelSpectatorCrowd
        position={[-5.8, 0, 0]}
        rotationY={Math.PI / 2}
        rowLength={14}
        teamColor="#2563eb"
      />
      {/* Right Grandstand (UKSW Red Supporter Section) */}
      <VoxelSpectatorCrowd
        position={[5.8, 0, 0]}
        rotationY={-Math.PI / 2}
        rowLength={14}
        teamColor="#dc2626"
      />
      {/* Rear Grandstand (Behind Player 2) */}
      <VoxelSpectatorCrowd
        position={[0, 0, -5.8]}
        rotationY={0}
        rowLength={10}
      />

      {/* 7. OVERHEAD STADIUM LIGHTING TRUSS */}
      <group position={[0, 5.7, 0]}>
        {/* Main longitudinal steel trusses */}
        <mesh position={[-3.2, 0, 0]}>
          <boxGeometry args={[0.12, 0.12, 14]} />
          <meshLambertMaterial color="#334155" flatShading />
        </mesh>
        <mesh position={[3.2, 0, 0]}>
          <boxGeometry args={[0.12, 0.12, 14]} />
          <meshLambertMaterial color="#334155" flatShading />
        </mesh>
        {/* Transverse steel trusses */}
        {[-4.5, -1.8, 1.8, 4.5].map((tz, i) => (
          <group key={`truss-${i}`} position={[0, 0, tz]}>
            <mesh>
              <boxGeometry args={[6.5, 0.12, 0.12]} />
              <meshLambertMaterial color="#334155" flatShading />
            </mesh>
            {/* Suspended Stadium Floodlight Spotlights */}
            {[-2.0, 0, 2.0].map((lx, j) => (
              <group key={`light-${j}`} position={[lx, -0.15, 0]}>
                <mesh rotation={[0.2, 0, 0]}>
                  <boxGeometry args={[0.22, 0.16, 0.22]} />
                  <meshLambertMaterial color="#0f172a" flatShading />
                </mesh>
                <mesh position={[0, -0.09, 0]}>
                  <boxGeometry args={[0.18, 0.02, 0.18]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            ))}
          </group>
        ))}
      </group>

      {/* 8. STADIUM ARENA WALLS WITH OFFICIAL FTI & UKSW DISPLAYS */}
      {/* Back Wall (Z = -7.5) */}
      <group position={[0, 3.2, -7.5]}>
        <mesh>
          <planeGeometry args={[18, 6.5]} />
          <meshLambertMaterial color="#243347" />
        </mesh>
        <mesh position={[0, 0.8, 0.01]}>
          <planeGeometry args={[18, 0.22]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
        <mesh position={[0, 0.55, 0.01]}>
          <planeGeometry args={[18, 0.22]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
        {[-4.5, -1.8, 1.8, 4.5].map((px, i) => (
          <mesh key={`pillar-back-${i}`} position={[px, 0, 0.06]}>
            <boxGeometry args={[0.20, 6.5, 0.14]} />
            <meshLambertMaterial color="#1e293b" flatShading />
          </mesh>
        ))}
      </group>

      {/* Front Wall (Z = 7.5) */}
      <group position={[0, 3.2, 7.5]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <planeGeometry args={[18, 6.5]} />
          <meshLambertMaterial color="#243347" />
        </mesh>
        <mesh position={[0, 0.8, 0.01]}>
          <planeGeometry args={[18, 0.22]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
        <mesh position={[0, 0.55, 0.01]}>
          <planeGeometry args={[18, 0.22]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
      </group>

      {/* LEFT WALL: FTI STADIUM DISPLAY (BLUE) */}
      <group position={[-7.45, 3.2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.05]}>
          <planeGeometry args={[16, 6.5]} />
          <meshLambertMaterial color="#1f3044" />
        </mesh>
        <mesh position={[0, 2.7, 0.01]}>
          <planeGeometry args={[16, 0.16]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh position={[0, -2.4, 0.01]}>
          <planeGeometry args={[16, 0.20]} />
          <meshBasicMaterial color="#1d4ed8" />
        </mesh>

        {/* Giant Illuminated FTI Banner Sign */}
        <mesh position={[0, 0.25, 0.04]}>
          <boxGeometry args={[7.2, 3.6, 0.08]} />
          <meshBasicMaterial map={ftiBannerTexture} />
        </mesh>
        <mesh position={[0, 0.25, -0.01]}>
          <boxGeometry args={[7.36, 3.76, 0.04]} />
          <meshLambertMaterial color="#0f172a" flatShading />
        </mesh>
        <mesh position={[0, 2.12, 0.09]}>
          <boxGeometry args={[7.3, 0.06, 0.06]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh position={[0, -1.62, 0.09]}>
          <boxGeometry args={[7.3, 0.06, 0.06]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>

        {[-5.0, -2.5, 2.5, 5.0].map((px, i) => (
          <group key={`pillar-left-${i}`} position={[px, 0, 0.08]}>
            <mesh>
              <boxGeometry args={[0.22, 6.5, 0.14]} />
              <meshLambertMaterial color="#1e293b" flatShading />
            </mesh>
            <mesh position={[0, 1.8, 0.08]}>
              <boxGeometry args={[0.24, 0.12, 0.04]} />
              <meshBasicMaterial color="#2563eb" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Blue Ambient Glow on Left Wall */}
      <pointLight position={[-6.8, 4.0, 0]} intensity={1.8} distance={9} color="#38bdf8" />

      {/* RIGHT WALL: UKSW STADIUM DISPLAY (RED) */}
      <group position={[7.45, 3.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.05]}>
          <planeGeometry args={[16, 6.5]} />
          <meshLambertMaterial color="#3a2228" />
        </mesh>
        <mesh position={[0, 2.7, 0.01]}>
          <planeGeometry args={[16, 0.16]} />
          <meshBasicMaterial color="#f87171" />
        </mesh>
        <mesh position={[0, -2.4, 0.01]}>
          <planeGeometry args={[16, 0.20]} />
          <meshBasicMaterial color="#b91c1c" />
        </mesh>

        {/* Giant Illuminated UKSW Banner Sign */}
        <mesh position={[0, 0.25, 0.04]}>
          <boxGeometry args={[7.2, 3.6, 0.08]} />
          <meshBasicMaterial map={ukswBannerTexture} />
        </mesh>
        <mesh position={[0, 0.25, -0.01]}>
          <boxGeometry args={[7.36, 3.76, 0.04]} />
          <meshLambertMaterial color="#0f172a" flatShading />
        </mesh>
        <mesh position={[0, 2.12, 0.09]}>
          <boxGeometry args={[7.3, 0.06, 0.06]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        <mesh position={[0, -1.62, 0.09]}>
          <boxGeometry args={[7.3, 0.06, 0.06]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>

        {[-5.0, -2.5, 2.5, 5.0].map((px, i) => (
          <group key={`pillar-right-${i}`} position={[px, 0, 0.08]}>
            <mesh>
              <boxGeometry args={[0.22, 6.5, 0.14]} />
              <meshLambertMaterial color="#1e293b" flatShading />
            </mesh>
            <mesh position={[0, 1.8, 0.08]}>
              <boxGeometry args={[0.24, 0.12, 0.04]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Red Ambient Glow on Right Wall */}
      <pointLight position={[6.8, 4.0, 0]} intensity={1.8} distance={9} color="#ef4444" />

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

      {/* 9. ALIVE VOXEL PLAYERS (Third-Person local player, opponent or ball machine) */}
      <AliveVoxelPlayer
        isLocal={true}
        slot={localSlot}
        shirtColor={localSlot === 'p1' ? '#dc2626' : '#2563eb'}
        localPaddlePos={localPaddlePos}
        ballPosRef={currentBallPos}
        baseZ={localSlot === 'p1' ? 2.05 : -2.05}
        facingSign={localSlot === 'p1' ? -1 : 1}
        cameraPreset={cameraPreset}
        handedness={handedness}
        recoilRef={paddleRecoilRef}
      />

      {gameMode === 'practice' ? (
        <VoxelBallMachine />
      ) : (
        <AliveVoxelPlayer
          isLocal={false}
          slot={localSlot === 'p1' ? 'p2' : 'p1'}
          shirtColor={localSlot === 'p1' ? '#2563eb' : '#dc2626'}
          localPaddlePos={localPaddlePos}
          ballPosRef={currentBallPos}
          baseZ={localSlot === 'p1' ? -2.05 : 2.05}
          facingSign={localSlot === 'p1' ? 1 : -1}
          cameraPreset={cameraPreset}
          handedness="right"
        />
      )}

      {/* 10. LOCAL & REMOTE PADDLE MESHES */}
      {/* Player 1 Paddle */}
      <group ref={p1MeshRef} position={[0, 0.95, 1.62]} visible={localSlot === 'p1' || gameMode !== 'practice'}>
        <VoxelPaddleWithHand rubberColor="#dc2626" />
      </group>

      {/* Player 2 Paddle */}
      <group ref={p2MeshRef} position={[0, 0.95, -1.62]} visible={localSlot === 'p2' || gameMode !== 'practice'}>
        <VoxelPaddleWithHand rubberColor="#2563eb" />
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

      {/* 16. CONTINUOUS TRAJECTORY ARC GUIDE (DURING SERVE & RALLY) */}
      <group ref={serveArcRef} visible={false}>
        {Array.from({ length: 18 }).map((_, idx) => (
          <mesh
            key={`serve-dot-${idx}`}
            ref={(el) => (serveArcDotsRef.current[idx] = el)}
            visible={false}
          >
            <boxGeometry args={[0.026, 0.026, 0.026]} />
            <meshBasicMaterial
              color="#00e5ff"
              transparent
              opacity={Math.max(0.20, 0.95 - idx * 0.045)}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
