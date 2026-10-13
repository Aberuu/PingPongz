# DESIGN.md - VoxelPong 3D LAN

## 1. Identity & Personality
- **Product**: VoxelPong 3D LAN
- **Identity**: Fast-paced, tactile 1v1 table tennis simulation over local network with a classic retro voxel/pixel-art aesthetic.
- **Personality**: Sharp, nostalgic, responsive, and arcade-focused. It feels like an authentic early-90s arcade sports cabinet brought to modern web browsers, with instant zero-lag controls and honest LAN networking.
- **Audience**: Two players sharing a local network (friends, co-workers, family) playing desktop browser 1v1.

## 2. Dials (Antislop Liveliness Standard)
- **ENERGY**: 2 (Balanced) - Punchy arcade styling and tactile feedback, without overwhelming neon or generic AI gradients.
- **RHYTHM**: 2 (Consistent with breaks) - Cohesive retro UI frames with clear functional distinctions between Lobby, Match HUD, and Pause/End screens.
- **MOTION**: 2 (Responsive & purposeful) - 60 FPS 3D ball and paddle physics, instantaneous local paddle feedback, and clean state switches. No generic AI fade-up/floating slop.

## 3. Color Palette (Curated 16-Color Arcade System)
Adheres to R-29 (maximum 2-3 core colors + 1 accent color, neutrals excluded):
- **Core Environment (Table)**: Deep Tournament Green (`#1b4d2e`) with crisp Chalk White court lines (`#f4f6f8`).
- **Core Players**:
  - Player 1 (Host): Crimson Red paddle face (`#d32f2f`) with Natural Wood handle (`#8d5b4c`).
  - Player 2 (Guest): Cobalt Blue paddle face (`#1976d2`) with Natural Wood handle (`#8d5b4c`).
- **Accent (Focal Point)**: High-contrast Arcade Ball Orange (`#ff6f00`) and Golden Yellow score highlights (`#ffb300`).
- **Neutrals / Arena**:
  - Arena Walls & Floor: Warm Charcoal / Matte Dark Slate (`#12151a`, `#1c2028`).
  - Table Net: Charcoal mesh with crisp white top tape (`#ffffff`).
  - Text & UI: Arcade Off-White (`#f0f4f8`) and Muted Grey (`#8c96a5`).
- **Contrast**: Guaranteed minimum 4.5:1 WCAG AA contrast on all interactive text.

## 4. Typography
- **Primary Arcade Font**: Pixel-art display font (`'Press Start 2P'`, `'Pixelify Sans'`, or crisp pixel bitmap fallback).
- **HUD & Numbers**: Crisp pixel digits scaled in clean integer multipliers (1x, 2x, 3x).
- **Reason (R-06 / R-31)**: Complements the low-resolution 480x270 / 640x360 pixelated Three.js render pipeline, recreating the authentic pixel grid without font rendering blur.

## 5. Visual Levers & Motif
- **One Focal Point per Screen**:
  - Lobby: IP address card with clear one-click copy button.
  - In-Game: The table surface, ball, and opposing paddle (uncluttered viewport).
  - Game Over: Match outcome and Rematch action.
- **Tactile Voxel Aesthetic**:
  - True low-resolution render target (480x270 or 640x360) upscaled with `image-rendering: pixelated`.
  - Textures set to `NearestFilter` without mipmaps.
  - Flat shading on 3D meshes (no heavy real-time dynamic shadows).
  - Dark blob shadow directly beneath the ball onto the table for spatial depth estimation.
- **No AI Slop Patterns**:
  - No purple/cyan gradients (R-01).
  - No em dashes in copy or UI text (R-02).
  - No floating glassmorphism overload (R-10).
  - No decorative button arrows without clear directional meaning (R-08).
  - No dead buttons or placeholder mockups (R-26).
