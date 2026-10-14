import { useEffect, useRef, useState, useCallback } from 'react';
import { PADDLE_PHYSICS } from '@shared/constants';
import type { PlayerSlot, ClientInputMsg, AssistPreset, Handedness } from '@shared/types';
import { network } from '../network/socketClient';

interface TouchControlOptions {
  sensitivity: number;
  playerSlot: PlayerSlot;
  isActive: boolean;
  assistPreset?: AssistPreset;
  handedness?: Handedness;
  onServeAction?: () => void;
  onPauseToggle?: () => void;
}

export function useTouchControls({
  sensitivity,
  playerSlot,
  isActive,
  assistPreset = 'normal',
  handedness = 'right',
  onServeAction,
  onPauseToggle
}: TouchControlOptions) {
  const [smashCooldownRatio, setSmashCooldownRatio] = useState(0);

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

  const touchStateRef = useRef<{
    activeTouchId: number | null;
    startX: number;
    startY: number;
    startTime: number;
    lastX: number;
    lastY: number;
    lastTime: number;
  }>({
    activeTouchId: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0
  });

  const triggerSmash = useCallback(() => {
    const now = Date.now();
    const p = paddleRef.current;
    if (now - p.lastSmashTime >= PADDLE_PHYSICS.smashCooldown * 1000) {
      p.lastSmashTime = now;
      p.swingZ = PADDLE_PHYSICS.swingDepthMax;
    }
  }, []);

  const setSlice = useCallback((active: boolean) => {
    paddleRef.current.isSlice = active;
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore if user tapped a button or modal element
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('button') || target.closest('.pixel-btn') || target.closest('.modal-overlay'))) {
        return;
      }

      if (e.touches.length > 0 && touchStateRef.current.activeTouchId === null) {
        const touch = e.touches[0];
        touchStateRef.current = {
          activeTouchId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          startTime: performance.now(),
          lastX: touch.clientX,
          lastY: touch.clientY,
          lastTime: performance.now()
        };

        // Also trigger serve toss if in serve phase
        onServeAction?.();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStateRef.current.activeTouchId === null) return;

      let touch: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchStateRef.current.activeTouchId) {
          touch = e.touches[i];
          break;
        }
      }
      if (!touch) return;

      const now = performance.now();
      const dt = Math.max(1, now - touchStateRef.current.lastTime);
      const dx = touch.clientX - touchStateRef.current.lastX;
      const dy = touch.clientY - touchStateRef.current.lastY;

      touchStateRef.current.lastX = touch.clientX;
      touchStateRef.current.lastY = touch.clientY;
      touchStateRef.current.lastTime = now;

      const p = paddleRef.current;
      const speedScale = 0.0028 * sensitivity;
      const xDirection = playerSlot === 'p1' ? 1 : -1;

      // Update paddle position
      p.x += dx * speedScale * xDirection;
      p.y -= dy * speedScale;

      p.x = Math.max(PADDLE_PHYSICS.minX, Math.min(PADDLE_PHYSICS.maxX, p.x));
      p.y = Math.max(PADDLE_PHYSICS.minY, Math.min(PADDLE_PHYSICS.maxY, p.y));

      // Calculate gesture velocity
      const touchSpeed = Math.hypot(dx, dy) / dt;
      p.swingZ = Math.min(PADDLE_PHYSICS.swingDepthMax, touchSpeed * 0.12);

      // Natural gesture smash: fast upward/forward flick
      if (dy < -18 && touchSpeed > 1.2) {
        triggerSmash();
      }

      // Procedural tilt calculation
      const inwardBias = Math.atan2(p.x, 1.8);
      const velocityYaw = -dx * 0.006 * xDirection;
      p.yaw = Math.max(-0.65, Math.min(0.65, inwardBias + velocityYaw));

      const heightBias = p.y < 0.95 ? (0.95 - p.y) * 0.35 : (0.95 - p.y) * 0.45;
      const velocityPitch = Math.max(-0.12, Math.min(0.12, -dy * 0.004));
      p.pitch = Math.max(-0.25, Math.min(0.22, heightBias + velocityPitch));

      p.roll = Math.max(-0.3, Math.min(0.3, dx * 0.005 * xDirection));
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStateRef.current.activeTouchId === null) return;

      let stillActive = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchStateRef.current.activeTouchId) {
          stillActive = true;
          break;
        }
      }

      if (!stillActive) {
        const now = performance.now();
        const duration = now - touchStateRef.current.startTime;
        const totalDist = Math.hypot(
          touchStateRef.current.lastX - touchStateRef.current.startX,
          touchStateRef.current.lastY - touchStateRef.current.startY
        );

        // Tap gesture detection (quick tap under 220ms and small displacement)
        if (duration < 220 && totalDist < 20) {
          onServeAction?.();
        }

        touchStateRef.current.activeTouchId = null;
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isActive, sensitivity, playerSlot, onServeAction, triggerSmash]);

  // 60Hz network update loop
  useEffect(() => {
    if (!isActive) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const p = paddleRef.current;

      // Update smash cooldown ratio
      const elapsedSmash = now - p.lastSmashTime;
      const cooldownMs = PADDLE_PHYSICS.smashCooldown * 1000;
      if (elapsedSmash < cooldownMs) {
        setSmashCooldownRatio(1 - elapsedSmash / cooldownMs);
      } else {
        setSmashCooldownRatio(0);
      }

      // Decay swing
      p.swingZ = Math.max(0, p.swingZ - 0.015);

      const isSmashing = elapsedSmash < 120;
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
    smashCooldownRatio,
    triggerSmash,
    setSlice,
    paddlePos: paddleRef.current
  };
}
