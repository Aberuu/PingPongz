# VoxelPong 3D LAN

Game simulasi tenis meja 1-lawan-1 bergaya retro voxel/pixel-art yang dimainkan langsung di browser melalui jaringan lokal (LAN / Wi-Fi yang sama). Tanpa akun, tanpa internet, dan tanpa instalasi rumit bagi pemain kedua (tamu).

---

## Fitur Utama

- **Fisika Otoritatif Server 120 Hz**: Server Node.js menghitung seluruh pantulan, gravitasi, dan aturan poin. Kedua layar selalu melihat hasil yang sama.
- **Prediksi Raket Lokal Nol Jeda**: Gerakan raket pemain lokal langsung merespons gerakan mouse tanpa menunggu jaringan.
- **Visual Retro Pixel 3D**: Dirender pada target resolusi rendah (480x270, 640x360, atau 960x540) dengan flat shading, NearestFilter, bayangan blob, dan jejak bola.
- **Audio 8-Bit Chiptune**: Efek suara pantulan meja, raket, smash, net, dan poin disintesis secara prosedural dengan Web Audio API.
- **Aturan Standar Tenis Meja**: Format first to 11 dengan selisih minimal 2 poin (deuce), rotasi servis tiap 2 poin (tiap 1 poin saat deuce), jeda otomatis, dan jendela rekoneksi 30 detik.

---

## Cara Menjalankan

### Persyaratan
- Node.js versi 18 ke atas pada PC Host.

### Langkah untuk Host (Pemain 1)
1. Buka terminal di folder proyek:
   ```bash
   npm install
   ```
2. Jalankan server host dalam satu perintah:
   ```bash
   npm run host
   ```
3. Terminal akan mencetak alamat LAN, misalnya:
   ```text
   Local URL:        http://localhost:3000
   LAN URL (Guest):  http://192.168.1.15:3000
   ```
4. Buka alamat tersebut di browser Chrome atau Edge.
5. Klik **Host (Pemain 1)** di menu lobi, salin alamat LAN untuk diberikan ke lawan, lalu klik **Saya Siap!**.

### Langkah untuk Tamu (Pemain 2)
1. Buka browser (Chrome / Edge) pada PC kedua di jaringan Wi-Fi/LAN yang sama.
2. Buka tautan IP yang diberikan Host (contoh: `http://192.168.1.15:3000`).
3. Masukkan nama panggilan dan klik **Saya Siap!**.
4. Permainan akan memulai hitung mundur 3 detik otomatis.

---

## Kontrol Permainan

- **Gerakan Mouse**: Menggerakkan raket secara horizontal dan vertikal di baseline meja.
- **Ayunan Maju Otomatis**: Kecepatan mouse mendorong raket maju untuk menambah tenaga ayunan.
- **Klik Kiri (Servis)**: Melempar bola ke atas untuk memulai servis saat giliran Anda.
- **Klik Kiri (Smash)**: Pukulan smash bertenaga dengan cooldown 0.6 detik.
- **Tombol Esc**: Melepas kursor dan menjeda permainan untuk kedua pemain.
- **Klik Layar**: Mengunci kembali kursor (Pointer Lock) untuk melanjutkan bermain.

---

## Panduan Firewall (Jika Tamu Gagal Terhubung)

Jika PC tamu tidak dapat membuka alamat host:

### 1. Pastikan Profil Jaringan adalah "Private" (Bukan Public)
- **Windows**: Buka `Settings` > `Network & Internet` > `Wi-Fi` (atau Ethernet) > Klik jaringan aktif > Pilih **Private network**.

### 2. Mengizinkan Port 3000 di Windows Firewall
Jalankan PowerShell sebagai Administrator pada PC Host:
```powershell
New-NetFirewallRule -DisplayName "VoxelPong 3D LAN (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### 3. macOS Firewall
Buka `System Settings` > `Network` > `Firewall` > Pastikan Node.js diizinkan untuk menerima koneksi masuk (incoming connections).

---

## Skrip Pengujian & Pengembangan

- `npm run dev`: Menjalankan server dan client Vite dev secara bersamaan (dengan proxy WebSocket).
- `npm run build`: Membangun client bundle ke folder `dist` dan server ke `dist-server`.
- `npm test`: Menjalankan suite pengujian Vitest untuk aturan skor dan fisika server.
