import { describe, it, expect } from 'vitest';
import { CAMERA_PRESETS, PADDLE_PHYSICS } from '../shared/constants.js';

describe('PRD 3.0 Camera & Line-Of-Sight (LOS) System', () => {
  it('ensures OTS preset meets minimum shoulder offset and tracking ratio', () => {
    const ots = CAMERA_PRESETS.ots;
    // PRD Sec 2 requires side offset >= 0.35m
    expect(ots.shoulderOffset).toBeGreaterThanOrEqual(0.35);
    // PRD Sec 2 requires 88% horizontal body shift
    expect(ots.shiftRatio).toBe(0.88);
  });

  it('verifies camera occlusion clearance formula c >= (w/2 + m) / (1 - d/Zc)', () => {
    // Parameters per PRD Section 2:
    const w = 0.42;  // Head/shoulder voxel width (m)
    const m = 0.08;  // Clear vision margin (m)
    const d = 0.20;  // Maximum lateral head sway during swing (m)
    const Zc = 2.62; // Camera distance from net / origin (m)

    const requiredClearance = (w / 2 + m) / (1 - d / Zc);
    expect(requiredClearance).toBeLessThanOrEqual(0.35);
    expect(CAMERA_PRESETS.ots.shoulderOffset).toBeGreaterThanOrEqual(requiredClearance);
  });

  it('validates ray-point distance math for head occlusion fading', () => {
    // Function that computes distance from head point H to ray segment C -> B
    const distPointToSegment = (
      px: number, py: number, pz: number,
      x1: number, y1: number, z1: number,
      x2: number, y2: number, z2: number
    ) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1, pz - z1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy + (pz - z1) * dz) / lenSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const projZ = z1 + t * dz;
      return Math.hypot(px - projX, py - projY, pz - projZ);
    };

    // Camera at (0.35, 1.34, 2.62)
    // Ball at (0, 0.85, 0.5)
    // Head centered directly between them at (0.175, 1.095, 1.56) -> distance = 0
    const headOnRayDist = distPointToSegment(0.175, 1.095, 1.56, 0.35, 1.34, 2.62, 0, 0.85, 0.5);
    expect(headOnRayDist).toBeLessThan(0.01);

    // Head moved away by 0.30m laterally
    const headClearedDist = distPointToSegment(0.475, 1.095, 1.56, 0.35, 1.34, 2.62, 0, 0.85, 0.5);
    expect(headClearedDist).toBeGreaterThan(0.25);
  });

  it('provides all 3 defined camera presets (ots, high, first-person)', () => {
    expect(CAMERA_PRESETS).toHaveProperty('ots');
    expect(CAMERA_PRESETS).toHaveProperty('high');
    expect(CAMERA_PRESETS).toHaveProperty('first-person');

    expect(CAMERA_PRESETS.high.baseY).toBeGreaterThan(CAMERA_PRESETS.ots.baseY);
    expect(CAMERA_PRESETS['first-person'].shoulderOffset).toBe(0.0);
  });
});
