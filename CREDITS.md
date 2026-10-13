# CREDITS & LICENSES - VoxelPong 3D LAN

Semua aset, pustaka, dan font yang digunakan dalam proyek ini dibuat secara mandiri atau berlisensi terbuka (Open Source / CC0 / OFL).

## 1. Tipografi & Font
- **Press Start 2P**
  - Pembuat: CodeMan38
  - Lisensi: SIL Open Font License (OFL) 1.1
  - Penggunaan: Teks menu retro, papan skor, dan HUD

- **Pixelify Sans**
  - Pembuat: Stefie Justprince
  - Lisensi: SIL Open Font License (OFL) 1.1
  - Penggunaan: Tipografi sekunder tampilan pixel

## 2. Audio & Efek Suara (SFX)
- **8-bit Chiptune Sound Synthesizer**
  - Implementasi: Sintesis prosedural murni menggunakan Web Audio API internal browser (OscillatorNode, GainNode, Exponential Ramp)
  - Lisensi: CC0 (Public Domain)
  - Efek: Pantulan bola meja, pukulan raket, smash, kontak net, arpeggio poin, dan jingle kemenangan

## 3. Visual 3D & Geometri Voxel
- Seluruh model 3D (meja tenis meja, net, raket merah/biru, lengan balok voxel, bola, bayangan blob, dan arena) dihasilkan secara prosedural lewat kode Three.js primitif (BoxGeometry, CylinderGeometry, SphereGeometry, PlaneGeometry).
- Lisensi: CC0 (Public Domain)

## 4. Pustaka Pihak Ketiga (Open Source Libraries)
- **Three.js** (MIT License) - Renderer 3D WebGL
- **React** & **React DOM** (MIT License) - Antarmuka Pengguna
- **React Three Fiber** & **@react-three/drei** (MIT License) - Integrasi deklaratif Three.js untuk React
- **Socket.io** (MIT License) - Protokol WebSocket waktu-nyata LAN
- **Express** (MIT License) - Server HTTP statis
- **Vite** (MIT License) - Bundler frontend
- **Vitest** (MIT License) - Unit test runner
