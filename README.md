# ⚡ NEON PONG: CYBER CLASH v2.0 ⚡
> *1v1 Real-Time Multiplayer Synthwave Cyberpunk Arcade Game — Hardened Edition*

![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20Socket.IO%20%7C%20HTML5%20Canvas-00ffff?style=for-the-badge)
![Audio Engine](https://img.shields.io/badge/Audio-Pure%20Web%20Audio%20API%20%2B%20Synth%20BGM-ff0077?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Helmet%20%7C%20CSP%20%7C%20Rate--Limit%20%7C%20Anti--Cheat-39ff14?style=for-the-badge)

---

## 🎮 What's New in v2.0 (Massive Upgrade)

1. **Security & Anti-Cheat Hardening**:
   - **Helmet & Strict CSP**: Melindungi aplikasi dari XSS, clickjacking (`X-Frame-Options: DENY`), dan MIME-sniffing.
   - **Socket Rate-Limiting**: Proteksi anti-flood / DDoS untuk koneksi dan event input.
   - **Input Sanitization**: Regex allowlist untuk nama pilot, warna paddle, dan room code.
   - **Server-Authoritative Anti-Cheat**: Velocity clamping pada paddle (`MAX_PADDLE_SPEED`) untuk mencegah teleport hack.
   - **Auto Stale-Room Reaper**: Membersihkan room kosong / tak aktif tiap 60 detik untuk mencegah memory leaks.
   - **Session Token Reconnection**: Menggunakan token rahasia untuk menyambungkan kembali pemain jika jaringan terputus.

2. **Game Modes**:
   - **1v1 Custom Private Rooms**: Main bareng teman via room code unik (contoh: `APEX-9ZA`).
   - **Quick Matchmaking Queue**: Tombol *"Quick Match"* untuk langsung mencari lawan secara instan.
   - **Solo vs AI Mode (Cyber Deity Bot)**: Main solo offline/single-player lawan AI adaptif cerdas.
   - **Live Spectator Mode**: Pemain ke-3 dan seterusnya otomatis menjadi penonton (spectator) live real-time.

3. **Audio & Visual Juiciness**:
   - **Procedural Synthwave BGM Engine**: Musik synthwave 80s sintetis murni (arpeggio bassline, chord synth pad, cyber kick drum) dengan tombol toggle 🎵 BGM ON/OFF.
   - **CRT Scanlines Filter**: Efek layar tabung arcade retro dengan tombol toggle 📺 CRT ON/OFF.
   - **Audio Visualizer Ribbon**: Bar equalizer neon responsif di bagian atas layar yang bergerak mengikuti ritme audio.
   - **Synthwave Horizon Sun**: Matahari neon retro di cakrawala arena.
   - **Mystery Cyber Power-Up Crates**: Kotak misteri melayang di tengah arena:
     - ⚡ **Overclock Speed**: Peningkatan kecepatan paddle & kelincahan
     - 💥 **Tri-Ball Clones**: Bola membelah menjadi 3 untuk mengecoh lawan
     - 💎 **Energy Recharge**: Tambahan +40 Core Generator secara instan
   - **Dynamic Combo Announcer**: Notifikasi teks neon mengambang saat rally tinggi (*"NICE RALLY!"*, *"HYPER CLASH!"*, *"CYBER OVERDRIVE!"*).

---

## ⚡ 5 Super Abilities & Counter-Play

| Kemampuan | Biaya | Shortcut | Durasi / Efek | Counter-Play |
|---|:---:|:---:|---|---|
| 🔥 **Super Comet Smash** | 30 ⚡ | `Space` / `1` | Kecepatan bola melonjak 1.8x dengan jejak api komet | Tangkis tepat di tengah paddle (sweet-spot) untuk memicu **Parry Clash!** |
| 🤖 **Defense Drone** | 40 ⚡ | `Q` / `2` | 8 Detik | Drone semi-otonom menjaga gawang dan memantulkan bola yang lolos |
| 🌀 **Singularity Vortex** | 35 ⚡ | `W` / `3` | 6 Detik | Wormhole gravitasi di tengah arena membelokkan lintasan bola secara dinamis |
| 👾 **Cyber Malware EMP** | 45 ⚡ | `E` / `4` | 3.5 Detik | Mengacaukan kontrol lawan (arah inverted) & memperkecil paddle lawan 30% |
| 🛡️ **Aegis Energy Shield** | 35 ⚡ | `R` / `5` | 6 Detik | Tembok energi abadi di garis belakang gawang memantulkan kembali bola yang terlewat (1x) |

---

## 🕹️ Kontrol Permainan

### Desktop
- **Gerakan Paddle**: Kursor mouse ke atas/bawah, atau tombol `W` / `S` / Panah Atas / Bawah.
- **Pemicu Kemampuan**: `Space`/`1` (Smash), `Q`/`2` (Drone), `W`/`3` (Vortex), `E`/`4` (Malware), `R`/`5` (Shield).

### Mobile / Layar Sentuh
- **Gerakan Paddle**: Drag / geser jari di layar untuk memposisikan paddle secara presisi.
- **Pemicu Kemampuan**: Tap langsung pada tombol ability deck di bagian bawah layar.

---

## 🚀 Cara Menjalankan

```bash
# 1. Install Dependencies
npm install

# 2. Jalankan Game
npm start
# Buka http://localhost:3000 di browser

# 3. Jalankan Automated Verification Test
npm test
```
