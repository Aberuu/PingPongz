import React from 'react';
import type { ResolutionPreset } from './GameCanvas';
import type { AssistPreset, CameraMode, Handedness, ScreenJuice } from '@shared/types';
import { soundFx } from '../audio/synth';

export interface UserSettings {
  sensitivity: number;
  fov: number;
  volume: number;
  isMuted: boolean;
  resolution: ResolutionPreset;
  showCrosshair: boolean;
  showBallIndicator: boolean;
  assistPreset: AssistPreset;
  cameraMode: CameraMode;
  handedness: Handedness;
  screenJuice: ScreenJuice;
}

interface SettingsModalProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose
}) => {
  const handleChange = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const updated = { ...settings, [key]: value };
    if (key === 'volume') {
      soundFx.setVolume(value as number);
    }
    if (key === 'isMuted') {
      soundFx.isMuted = value as boolean;
    }
    onUpdateSettings(updated);
    try {
      localStorage.setItem('voxelpong_settings', JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div className="pixel-card" style={{ width: '520px', maxWidth: '94%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: 'var(--color-ball)' }}>PENGATURAN GAME</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '11px' }}>
          {/* Mouse Sensitivity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8c96a5' }}>SENSITIVITAS MOUSE:</span>
              <span style={{ color: '#ffb300' }}>{settings.sensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="2.5"
              step="0.1"
              value={settings.sensitivity}
              onChange={(e) => handleChange('sensitivity', parseFloat(e.target.value))}
              style={{ accentColor: '#ff7a00', cursor: 'pointer' }}
            />
          </div>

          {/* Camera FOV */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8c96a5' }}>KAMERA FIELD OF VIEW (FOV):</span>
              <span style={{ color: '#ffb300' }}>{settings.fov}°</span>
            </div>
            <input
              type="range"
              min="60"
              max="85"
              step="1"
              value={settings.fov}
              onChange={(e) => handleChange('fov', parseInt(e.target.value, 10))}
              style={{ accentColor: '#ff7a00', cursor: 'pointer' }}
            />
          </div>

          {/* Volume & Mute */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8c96a5' }}>VOLUME AUDIO RETRO:</span>
              <span style={{ color: '#ffb300' }}>{Math.round(settings.volume * 100)}%</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.volume}
                onChange={(e) => handleChange('volume', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#ff7a00', cursor: 'pointer' }}
              />
              <button
                className="pixel-btn"
                onClick={() => handleChange('isMuted', !settings.isMuted)}
                style={{ fontSize: '10px', padding: '6px 10px' }}
              >
                {settings.isMuted ? 'UNMUTE' : 'MUTE'}
              </button>
            </div>
          </div>

          {/* Pixel Render Resolution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ color: '#8c96a5' }}>PRESET RESOLUSI PIXEL 3D:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['low', 'medium', 'high'] as ResolutionPreset[]).map((res) => (
                <button
                  key={res}
                  className={`pixel-btn ${settings.resolution === res ? 'btn-primary' : ''}`}
                  onClick={() => handleChange('resolution', res)}
                  style={{ flex: 1, fontSize: '10px', padding: '8px 4px' }}
                >
                  {res === 'low' ? '480p (Retro)' : res === 'medium' ? '640p (Standar)' : '960p (Tajam)'}
                </button>
              ))}
            </div>
          </div>

          {/* Assist Difficulty Preset */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8c96a5' }}>PRESET BANTUAN PEMAIN:</span>
              <span style={{ color: '#ffb300' }}>
                {settings.assistPreset === 'casual' ? 'Santai' : settings.assistPreset === 'normal' ? 'Normal' : 'Pro'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['casual', 'normal', 'pro'] as AssistPreset[]).map((preset) => (
                <button
                  key={preset}
                  className={`pixel-btn ${settings.assistPreset === preset ? 'btn-primary' : ''}`}
                  onClick={() => handleChange('assistPreset', preset)}
                  style={{ flex: 1, fontSize: '10px', padding: '8px 4px' }}
                >
                  {preset === 'casual' ? 'Santai (1.6x)' : preset === 'normal' ? 'Normal (1.3x)' : 'Pro (Murni)'}
                </button>
              ))}
            </div>
          </div>

          {/* Camera Motion Mode */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8c96a5' }}>GERAK KAMERA POV:</span>
              <span style={{ color: '#ffb300' }}>
                {settings.cameraMode === 'static' ? 'Statis' : settings.cameraMode === 'subtle' ? 'Ringan' : 'Dinamis'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['static', 'subtle', 'dynamic'] as CameraMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`pixel-btn ${settings.cameraMode === mode ? 'btn-primary' : ''}`}
                  onClick={() => handleChange('cameraMode', mode)}
                  style={{ flex: 1, fontSize: '10px', padding: '8px 4px' }}
                >
                  {mode === 'static' ? 'Statis' : mode === 'subtle' ? 'Ringan' : 'Dinamis'}
                </button>
              ))}
            </div>
          </div>

          {/* Handedness Option */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#8c96a5' }}>TANGAN UTAMA (RAKET):</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['right', 'left'] as Handedness[]).map((h) => (
                <button
                  key={h}
                  className={`pixel-btn ${settings.handedness === h ? 'btn-primary' : ''}`}
                  onClick={() => handleChange('handedness', h)}
                  style={{ fontSize: '10px', padding: '6px 12px' }}
                >
                  {h === 'right' ? 'KANAN' : 'KIDAL'}
                </button>
              ))}
            </div>
          </div>

          {/* Screen Effects / Juice */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8c96a5' }}>EFEK GETAR LAYAR (JUICE):</span>
              <span style={{ color: '#ffb300' }}>
                {settings.screenJuice === 'off' ? 'Mati' : settings.screenJuice === 'subtle' ? 'Ringan' : 'Penuh'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['off', 'subtle', 'full'] as ScreenJuice[]).map((juice) => (
                <button
                  key={juice}
                  className={`pixel-btn ${settings.screenJuice === juice ? 'btn-primary' : ''}`}
                  onClick={() => handleChange('screenJuice', juice)}
                  style={{ flex: 1, fontSize: '10px', padding: '8px 4px' }}
                >
                  {juice === 'off' ? 'Mati' : juice === 'subtle' ? 'Ringan' : 'Penuh'}
                </button>
              ))}
            </div>
          </div>

          {/* Crosshair Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
            <span style={{ color: '#8c96a5' }}>TAMPILKAN CROSSHAIR TENGAH:</span>
            <button
              className="pixel-btn"
              onClick={() => handleChange('showCrosshair', !settings.showCrosshair)}
              style={{ fontSize: '10px', padding: '6px 12px' }}
            >
              {settings.showCrosshair ? 'AKTIF' : 'NONAKTIF'}
            </button>
          </div>

          {/* Ball Arrival Indicator Assist Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
            <span style={{ color: '#8c96a5' }}>INDIKATOR LINGKARAN BOLA:</span>
            <button
              className="pixel-btn btn-primary"
              onClick={() => handleChange('showBallIndicator', !settings.showBallIndicator)}
              style={{ fontSize: '10px', padding: '6px 12px' }}
            >
              {settings.showBallIndicator ? 'AKTIF' : 'NONAKTIF'}
            </button>
          </div>
        </div>

        {/* Close Button */}
        <div style={{ marginTop: '20px' }}>
          <button
            className="pixel-btn btn-primary"
            onClick={onClose}
            style={{ width: '100%', padding: '12px', fontSize: '12px' }}
          >
            TUTUP PENGATURAN
          </button>
        </div>
      </div>
    </div>
  );
};
