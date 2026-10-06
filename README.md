# ⚡ NEON PONG: CYBER CLASH ⚡
> *1v1 Real-Time Multiplayer Synthwave Cyberpunk Arcade Game*

![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20Socket.IO%20%7C%20HTML5%20Canvas-00ffff?style=for-the-badge)
![Audio Engine](https://img.shields.io/badge/Audio-Pure%20Web%20Audio%20API-ff0077?style=for-the-badge)
![Physics](https://img.shields.io/badge/Physics-Server--Authoritative%2060%20Tick-39ff14?style=for-the-badge)

---

## 🎮 Overview

**Neon Pong: Cyber Clash** adalah game arcade ping pong multiplayer 1v1 berbasis web dengan tema synthwave/cyberpunk futuristik. Dilengkapi dengan 5 kemampuan super (super abilities), sistem counter-play **Parry Clash**, sinkronisasi fisika *server-authoritative* 60 tick/detik, dan audio prosedural 80-an tanpa file aset eksternal.

---

## ✨ Fitur Utama

- **1v1 Room & Lobby System**: Pembuatan room instan dengan kode unik (contoh: `NEON-7X`, `APEX-LTC`), role assignment (Host: Cyan Neon, Guest: Magenta Neon), status ready, dan hitung mundur 3 detik.
- **Server-Authoritative Physics (60 FPS)**: Semua kalkulasi lintasan bola, tabrakan bounding box, pantulan, skill, dan skor dihitung di server untuk mencegah desinkronisasi & cheat.
- **Client-Side Visual Interpolation (Lerp)**: Gerakan bola dan paddle tetap halus 60+ FPS meskipun ada fluktuasi jaringan.
- **Pure Web Audio API**: Procedural sound synthesizer untuk suara tabrakan, ledakan comet smash, parry clash, drone laser, black hole hum, malware glitch, dan fanfare gol.
- **Juicy Cyberpunk Visuals**: Perspective synthwave floor grid, neon motion blur trails, dynamic screen shake, shockwaves, spark particles, dan floating feedback text.
- **Disconnection & Walkout (WO) Handling**: Jeda otomatis jika lawan terputus dengan hitung mundur 15 detik untuk reconnect. Jika waktu habis, kemenangan WO otomatis diberikan.
- **Responsive Controls**: Mendukung mouse, keyboard (W/S, Arrow Keys), dan layar sentuh (mobile touch drag + touch action bar).

---

## ⚡ 5 Super Abilities & Counter-Play

| Kemampuan | Biaya | Shortcut | Durasi / Efek | Counter-Play |
|---|:---:|:---:|---|---|
| 🔥 **Super Comet Smash** | 30 ⚡ | `Space` / `1` | Kecepatan bola melonjak 1.8x dengan jejak api komet | Tangkis tepat di tengah paddle (sweet-spot) untuk memicu **Parry Clash!** |
| 🤖 **Defense Drone** | 40 ⚡ | `Q` / `2` | 8 Detik | Drone semi-otonom menjaga gawang dan memantulkan bola yang lolos |
| 🌀 **Singularity Vortex** | 35 ⚡ | `W` / `3` | 6 Detik | Wormhole gravitasi di tengah arena membelokkan lintasan bola secara dinamis |
| 👾 **Cyber Malware EMP** | 45 ⚡ | `E` / `4` | 3.5 Detik | Mengacaukan kontrol lawan (arah inverted) & memperkecil paddle lawan 30% |
| 🛡️ **Aegis Energy Shield** | 35 ⚡ | `R` / `5` | 6 Detik | Tembok energi abadi di garis belakang gawang memantulkan kembali bola yang terlewat (1x) |

### ⚡ Mekanisme Ekonomi Energi
- **Kapasitas Maksimal**: 100 Energy
- **Regenerasi Pasif**: +0.2 energy/detik
- **Pukulan Sukses (Paddle Hit)**: +15 energy
- **Kebobolan (Comeback Mechanic)**: +25 energy

---

## 🕹️ Kontrol Permainan

### Desktop
- **Gerakan Paddle**: Gerakkan kursor mouse ke atas/bawah, atau gunakan tombol `W` / `S` / Panah Atas / Bawah.
- **Pemicu Kemampuan**:
  - `Space` atau `1`: Super Comet Smash
  - `Q` atau `2`: Defense Drone
  - `W` atau `3`: Singularity Vortex
  - `E` atau `4`: Cyber Malware EMP
  - `R` atau `5`: Aegis Energy Shield

### Mobile / Layar Sentuh
- **Gerakan Paddle**: Drag / geser jari di layar untuk memposisikan paddle secara presisi.
- **Pemicu Kemampuan**: Tap langsung pada tombol ability deck di bagian bawah layar.

---

## 🚀 Cara Menjalankan

### 1. Prasyarat
- [Node.js](https://nodejs.org/) (v16 ke atas)
- npm

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Menjalankan Server
```bash
npm start
```
Buka browser dan akses:
```
http://localhost:3000
```

### 4. Menjalankan Automated Verification Test
```bash
npm test
```

---

## 📁 Struktur Direktori

```
├── public/
│   ├── index.html         # Struktur UI, HUD, Deck Kemampuan, & Modal
│   ├── style.css          # Estetika Synthwave/Cyberpunk, Neon Glow, & Responsivitas
│   └── game.js            # Web Audio Synth, Socket Client, Canvas Renderer, & Input
├── server.js              # Server Authoritative Express + Socket.IO, Rooms, & Physics Loop
├── test_multiplayer.js    # Headless E2E Automated Multiplayer Test
├── run_verification.js    # Runner script verifikasi server & test
├── package.json           # Dependensi & skrip proyek
└── README.md              # Dokumentasi lengkap
```
