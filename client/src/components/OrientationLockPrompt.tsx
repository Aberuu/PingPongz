import React, { useState, useEffect } from 'react';

export const OrientationLockPrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (!isTouch) {
        setIsPortrait(false);
        return;
      }
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#0a0d14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        color: '#f0f4f8',
        fontFamily: "'Press Start 2P', monospace"
      }}
    >
      {/* Animated Rotating Retro Phone Icon */}
      <div
        style={{
          width: '64px',
          height: '100px',
          border: '4px solid #ff7a00',
          borderRadius: '12px',
          position: 'relative',
          marginBottom: '28px',
          boxShadow: '0 0 16px rgba(255, 122, 0, 0.4)',
          animation: 'rotatePhone 2.5s infinite ease-in-out'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '16px',
            height: '4px',
            backgroundColor: '#8c96a5',
            borderRadius: '2px'
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            border: '2px solid #8c96a5'
          }}
        />
      </div>

      <style>{`
        @keyframes rotatePhone {
          0%, 20% {
            transform: rotate(0deg);
          }
          50%, 70% {
            transform: rotate(90deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }
      `}</style>

      <div
        style={{
          fontSize: '14px',
          color: 'var(--color-ball, #ff7a00)',
          marginBottom: '14px',
          letterSpacing: '1px',
          lineHeight: '1.6'
        }}
      >
        PUTAR PERANGKAT KE MODE LANSKAP
      </div>

      <div
        style={{
          fontSize: '9px',
          color: '#8c96a5',
          lineHeight: '1.8',
          maxWidth: '320px'
        }}
      >
        VoxelPong 3D dirancang untuk rasio layar horizontal agar meja dan lawan terlihat jelas.
      </div>
    </div>
  );
};
