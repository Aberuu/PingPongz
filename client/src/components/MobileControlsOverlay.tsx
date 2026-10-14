import React from 'react';

interface MobileControlsOverlayProps {
  smashCooldownRatio: number;
  onTriggerSmash: () => void;
  onSetSlice: (active: boolean) => void;
  onPauseToggle: () => void;
  isPhaseServing: boolean;
}

export const MobileControlsOverlay: React.FC<MobileControlsOverlayProps> = ({
  smashCooldownRatio,
  onTriggerSmash,
  onSetSlice,
  onPauseToggle,
  isPhaseServing
}) => {
  const isSmashReady = smashCooldownRatio <= 0;

  const handleSmashTouch = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (isSmashReady) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
      onTriggerSmash();
    }
  };

  const handleSliceStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    onSetSlice(true);
  };

  const handleSliceEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    onSetSlice(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '12px 16px'
      }}
    >
      {/* Top Left: Pause Button for Mobile */}
      <div style={{ display: 'flex', pointerEvents: 'auto' }}>
        <button
          className="pixel-btn"
          onClick={onPauseToggle}
          style={{
            fontSize: '9px',
            padding: '6px 10px',
            backgroundColor: 'rgba(20, 25, 35, 0.75)',
            border: '2px solid #3d495c'
          }}
        >
          II JEDA
        </button>
      </div>

      {/* Bottom Right: Smart Touch Action Buttons */}
      <div
        style={{
          alignSelf: 'flex-end',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'auto',
          marginBottom: '8px'
        }}
      >
        {/* Defensive Slice / Chop Button */}
        <button
          className="pixel-btn"
          onTouchStart={handleSliceStart}
          onTouchEnd={handleSliceEnd}
          onTouchCancel={handleSliceEnd}
          onMouseDown={handleSliceStart}
          onMouseUp={handleSliceEnd}
          onMouseLeave={handleSliceEnd}
          style={{
            width: '64px',
            height: '46px',
            fontSize: '9px',
            padding: '4px',
            backgroundColor: 'rgba(2, 132, 199, 0.45)',
            borderColor: '#38bdf8',
            color: '#e0f2fe',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            touchAction: 'none'
          }}
        >
          SLICE
        </button>

        {/* Smash Button */}
        <div style={{ position: 'relative' }}>
          <button
            className={`pixel-btn ${isSmashReady ? 'btn-primary' : ''}`}
            onTouchStart={handleSmashTouch}
            onClick={handleSmashTouch}
            style={{
              width: '74px',
              height: '52px',
              fontSize: '11px',
              padding: '6px',
              backgroundColor: isSmashReady ? 'rgba(216, 67, 21, 0.85)' : 'rgba(38, 50, 56, 0.65)',
              borderColor: isSmashReady ? '#ff7a00' : '#455a64',
              color: isSmashReady ? '#ffffff' : '#90a4ae',
              boxShadow: isSmashReady ? '0 0 16px rgba(255, 122, 0, 0.5)' : 'none',
              backdropFilter: 'blur(4px)',
              touchAction: 'none',
              transition: 'all 0.1s ease'
            }}
          >
            SMASH
          </button>

          {/* Cooldown Radial / Bar Gauge */}
          {smashCooldownRatio > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: '-4px',
                left: 0,
                right: 0,
                height: '4px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(1 - smashCooldownRatio) * 100}%`,
                  backgroundColor: '#ffb300'
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
