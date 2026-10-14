import { useEffect, useRef, useState, useCallback } from 'react';
import { PADDLE_PHYSICS } from '@shared/constants';
import type { PlayerSlot, ClientInputMsg, AssistPreset, Handedness } from '@shared/types';
import { network } from '../network/socketClient';

interface MouseControlOptions {
  sensitivity: number;
  playerSlot: PlayerSlot;
  isActive: boolean;
  assistPreset?: AssistPreset;
  handedness?: Handedness;
  onServeAction?: () => void;
  onPauseToggle?: () => void;
}

export function useMouseControls({
  sensitivity,
  playerSlot,
  isActive,
  assistPreset = 'normal',
  handedness = 'right',
  onServeAction,
  onPauseToggle
}: MouseControlOptions) {
  const [isLocked, setIsLocked] = useState(false);
  const [smashCooldownRatio, setSmashCooldownRatio] = useState(0); // 0 = ready, 1 = max cooldown

  // Internal paddle state: default resting position slightly offset by handedness
  const paddleRef = useRef({
    x: handedness === 'left' ? -0.22 : 0.22,
    y: 0.95,
    swingZ: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    footworkX: 0,
    isSlice: false,
    lastSmashTime: 0,
    seq: 0
  });

  const requestLock = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    try {
      // Try with unadjustedMovement to prevent OS acceleration on Chrome/Edge
      const promise = (element as unknown as {
        requestPointerLock: (options?: { unadjustedMovement?: boolean }) => Promise<void>;
      }).requestPointerLock({ unadjustedMovement: true });

      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          // Fallback to standard pointer lock
          element.requestPointerLock();
        });
      }
    } catch {
      element.requestPointerLock();
    }
  }, []);

  const exitLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  useEffect(() => {
    const handleLockChange = () => {
      const locked = !!document.pointerLockElement;
      setIsLocked(locked);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Escape') {
        // Esc releases pointer and triggers pause
        onPauseToggle?.();
        return;
      }

      if (!isLocked || !isActive) return;

      const p = paddleRef.current;
      const xDirection = playerSlot === 'p1' ? 1 : -1;
      const step = 0.05;

      // A and D keys control baseline footwork during both rally and serve
      if (e.code === 'KeyA' || e.key === 'ArrowLeft') {
        p.footworkX -= step * xDirection;
        p.footworkX = Math.max(-PADDLE_PHYSICS.footworkMaxX, Math.min(PADDLE_PHYSICS.footworkMaxX, p.footworkX));
        p.x -= step * xDirection;
        p.x = Math.max(PADDLE_PHYSICS.minX, Math.min(PADDLE_PHYSICS.maxX, p.x));
      } else if (e.code === 'KeyD' || e.key === 'ArrowRight') {
        p.footworkX += step * xDirection;
        p.footworkX = Math.max(-PADDLE_PHYSICS.footworkMaxX, Math.min(PADDLE_PHYSICS.footworkMaxX, p.footworkX));
        p.x += step * xDirection;
        p.x = Math.max(PADDLE_PHYSICS.minX, Math.min(PADDLE_PHYSICS.maxX, p.x));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isLocked || !isActive) return;

      const p = paddleRef.current;
      const speedScale = 0.0022 * sensitivity;

      // Coordinate delta: X moves horizontally
      // For Player 2 (viewing from negative Z looking +Z), mouse right (+X) is inverted on screen vs world X
      const xDirection = playerSlot === 'p1' ? 1 : -1;
      p.x += e.movementX * speedScale * xDirection;
      p.y -= e.movementY * speedScale; // Moving mouse up increases Y

      // Clamp to physical court reach bounds
      p.x = Math.max(PADDLE_PHYSICS.minX, Math.min(PADDLE_PHYSICS.maxX, p.x));
      p.y = Math.max(PADDLE_PHYSICS.minY, Math.min(PADDLE_PHYSICS.maxY, p.y));

      // Dynamic forward swing based on mouse velocity
      const mouseSpeed = Math.hypot(e.movementX, e.movementY);
      p.swingZ = Math.min(PADDLE_PHYSICS.swingDepthMax, mouseSpeed * 0.0035);

      // Procedural tilt calculation
      // Yaw angles paddle naturally inward toward table center when reaching for side/corner balls
      const inwardBias = Math.atan2(p.x, 1.8);
      const velocityYaw = -e.movementX * 0.007 * xDirection;
      p.yaw = Math.max(-0.65, Math.min(0.65, inwardBias + velocityYaw));

      // Pitch angles: when low, scoop face slightly up (+); when high, close face down (-) for topspin
      const heightBias = p.y < 0.95 ? (0.95 - p.y) * 0.35 : (0.95 - p.y) * 0.45;
      const velocityPitch = Math.max(-0.12, Math.min(0.12, -e.movementY * 0.003));
      p.pitch = Math.max(-0.25, Math.min(0.22, heightBias + velocityPitch));

      // Roll banks slightly with horizontal motion
      p.roll = Math.max(-0.3, Math.min(0.3, e.movementX * 0.005 * xDirection));
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isLocked || !isActive) return;

      if (e.button === 0) {
        // Left click: Smash / standard hit or serve action
        const now = Date.now();
        const p = paddleRef.current;

        // Check smash cooldown
        if (now - p.lastSmashTime >= PADDLE_PHYSICS.smashCooldown * 1000) {
          p.lastSmashTime = now;
        }

        // Also trigger serve toss if in serve phase
        onServeAction?.();
      } else if (e.button === 2) {
        // Right click: Defensive slice / lob (chop)
        paddleRef.current.isSlice = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        paddleRef.current.isSlice = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isLocked, isActive, sensitivity, playerSlot, onServeAction, onPauseToggle]);

  // High-frequency 60Hz input transmission loop to server
  useEffect(() => {
    if (!isActive) return;

    const interval = window.setInterval(() => {
      const p = paddleRef.current;
      const now = Date.now();

      // Decay swing depth back to zero
      p.swingZ = Math.max(0, p.swingZ - 0.015);

      // Calculate smash cooldown ratio
      const elapsedSmash = now - p.lastSmashTime;
      const totalCooldown = PADDLE_PHYSICS.smashCooldown * 1000;
      const ratio = Math.max(0, 1 - elapsedSmash / totalCooldown);
      setSmashCooldownRatio(ratio);

      const isSmashing = elapsedSmash < 120; // Active smash window 120ms
      p.seq += 1;

      const inputMsg: ClientInputMsg = {
        seq: p.seq,
        clientTime: now,
        paddleX: p.x,
        paddleY: p.y,
        swingZ: p.swingZ,
        pitch: p.pitch,
        yaw: p.yaw,
        roll: p.roll,
        isSmash: isSmashing,
        isSlice: p.isSlice,
        footworkX: p.footworkX,
        assistPreset
      };

      network.sendInput(inputMsg);
    }, 1000 / 60);

    return () => window.clearInterval(interval);
  }, [isActive, assistPreset]);

  return {
    isLocked,
    requestLock,
    exitLock,
    smashCooldownRatio,
    paddlePos: paddleRef.current
  };
}
