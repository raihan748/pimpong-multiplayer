// ============================================================================
// NEON PONG: CYBER CLASH — ULTRA UPGRADED CLIENT ENGINE
// ============================================================================

const socket = io({
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// Virtual Arena Dimensions
const ARENA_WIDTH = 1000;
const ARENA_HEIGHT = 600;

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const screenMenu = document.getElementById('screen-menu');
const screenLobby = document.getElementById('screen-lobby');
const screenHud = document.getElementById('screen-hud');
const screenMatchEnd = document.getElementById('screen-match-end');
const modalCodex = document.getElementById('modal-codex');
const crtOverlay = document.getElementById('crt-overlay');
const eqBars = document.querySelectorAll('.eq-bar');

// Settings Toolbar
const btnToggleBgm = document.getElementById('btn-toggle-bgm');
const btnToggleSfx = document.getElementById('btn-toggle-sfx');
const btnToggleCrt = document.getElementById('btn-toggle-crt');
const btnOpenCodexToolbar = document.getElementById('btn-open-codex-toolbar');

// Menu Controls
const inputPlayerName = document.getElementById('player-name');
const btnQuickMatch = document.getElementById('btn-quick-match');
const quickMatchText = document.getElementById('quick-match-text');
const btnSoloAi = document.getElementById('btn-solo-ai');
const btnCreateRoom = document.getElementById('btn-create-room');
const inputJoinCode = document.getElementById('join-room-code');
const btnJoinRoom = document.getElementById('btn-join-room');
const colorButtons = document.querySelectorAll('.color-btn');
const btnOpenCodex = document.getElementById('btn-open-codex');
const btnCloseCodex = document.getElementById('btn-close-codex');

// Lobby Controls
const lobbyRoomCode = document.getElementById('lobby-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const spectatorsBadge = document.getElementById('spectators-badge');
const hostNameEl = document.getElementById('host-name');
const guestNameEl = document.getElementById('guest-name');
const hostPreviewPaddle = document.getElementById('host-preview-paddle');
const hostReadyTag = document.getElementById('host-ready-tag');
const guestReadyTag = document.getElementById('guest-ready-tag');
const btnReadyToggle = document.getElementById('btn-ready-toggle');
const btnAddBot = document.getElementById('btn-add-bot');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');

// HUD Elements
const hudHostName = document.getElementById('hud-host-name');
const hudGuestName = document.getElementById('hud-guest-name');
const hudHostScore = document.getElementById('hud-host-score');
const hudGuestScore = document.getElementById('hud-guest-score');
const pingIndicator = document.getElementById('ping-indicator');
const rallyIndicator = document.getElementById('rally-indicator');
const spectatorHudBadge = document.getElementById('spectator-hud-badge');
const energyProgressFill = document.getElementById('energy-progress-fill');
const energyNumeric = document.getElementById('energy-numeric');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const comboBanner = document.getElementById('combo-banner');
const comboText = document.getElementById('combo-text');
const disconnectOverlay = document.getElementById('disconnect-overlay');
const disconnectTimerDisplay = document.getElementById('disconnect-timer-display');
const abilityButtons = document.querySelectorAll('.ability-btn');

// End Screen Elements
const endMatchStatus = document.getElementById('end-match-status');
const endMatchSub = document.getElementById('end-match-sub');
const endHostName = document.getElementById('end-host-name');
const endGuestName = document.getElementById('end-guest-name');
const endHostScore = document.getElementById('end-host-score');
const endGuestScore = document.getElementById('end-guest-score');
const statP1Header = document.getElementById('stat-p1-header');
const statP2Header = document.getElementById('stat-p2-header');
const statP1Hits = document.getElementById('stat-p1-hits');
const statP2Hits = document.getElementById('stat-p2-hits');
const statP1Smashes = document.getElementById('stat-p1-smashes');
const statP2Smashes = document.getElementById('stat-p2-smashes');
const statP1Parries = document.getElementById('stat-p1-parries');
const statP2Parries = document.getElementById('stat-p2-parries');
const statP1Energy = document.getElementById('stat-p1-energy');
const statP2Energy = document.getElementById('stat-p2-energy');
const statMaxRally = document.getElementById('stat-max-rally');
const btnRematch = document.getElementById('btn-rematch');
const rematchBtnText = document.getElementById('rematch-btn-text');
const btnLeaveMatch = document.getElementById('btn-leave-match');
const toastContainer = document.getElementById('toast-container');

// Client State
let myRole = null; // 'host', 'guest', or 'spectator'
let myRoomCode = null;
let selectedColor = '#00ffff';
let isReady = false;
let isQueueingMatch = false;
let currentScreen = 'screen-menu';
let isSfxEnabled = true;
let isBgmEnabled = false;
let isCrtEnabled = true;

// Render & Interpolation State
let latestSnapshot = null;
const renderState = {
  balls: [{ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, radius: 10, isSmash: false }],
  paddles: {
    host: { x: 35, y: 245, height: 110, color: '#00ffff' },
    guest: { x: ARENA_WIDTH - 49, y: 245, height: 110, color: '#ff0077' }
  },
  drones: {
    host: { x: 160, y: 300, active: false },
    guest: { x: ARENA_WIDTH - 160, y: 300, active: false }
  },
  vortex: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, radius: 110, active: false, angle: 0 },
  powerUp: null
};

// FX State
let screenShake = 0;
const particles = [];
const shockwaves = [];
const floatTexts = [];
const ballTrails = new Map(); // id -> trail array
let prevRally = 0;

// ============================================================================
// 1. ADVANCED PROCEDURAL SYNTH AUDIO ENGINE & BGM
// ============================================================================
class SynthAudioEngine {
  constructor() {
    this.ctx = null;
    this.bgmTimer = null;
    this.bgmStep = 0;
    // Synthwave Chord Progression: Am -> F -> C -> G
    this.bassNotes = [
      110, 110, 164.81, 110, 110, 110, 164.81, 110, // A2, E3
      87.31, 87.31, 130.81, 87.31, 87.31, 87.31, 130.81, 87.31, // F2, C3
      130.81, 130.81, 196.00, 130.81, 130.81, 130.81, 196.00, 130.81, // C3, G3
      98.00, 98.00, 146.83, 98.00, 98.00, 98.00, 146.83, 98.00  // G2, D3
    ];
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  startBgm() {
    this.init();
    if (this.bgmTimer) return;
    this.bgmStep = 0;
    const tempoMs = 125; // 120 BPM 16th notes
    this.bgmTimer = setInterval(() => {
      if (!isBgmEnabled) return;
      this.playBgmStep();
    }, tempoMs);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playBgmStep() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const step = this.bgmStep % this.bassNotes.length;
    const freq = this.bassNotes[step];

    // Synth Bass Arpeggio Note
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.1);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);

    // 4-on-the-floor Cyber Kick Drum on beats 0, 4, 8, 12, etc.
    if (step % 4 === 0) {
      const kickOsc = this.ctx.createOscillator();
      const kickGain = this.ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(150, now);
      kickOsc.frequency.exponentialRampToValueAtTime(30, now + 0.12);
      kickGain.gain.setValueAtTime(0.2, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      kickOsc.connect(kickGain);
      kickGain.connect(this.ctx.destination);
      kickOsc.start(now);
      kickOsc.stop(now + 0.13);
    }

    // Animate UI Equalizer Ribbon
    animateEqualizer();
    this.bgmStep++;
  }

  playSfx(type) {
    if (!isSfxEnabled) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
      case 'hit':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;

      case 'smash':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.38);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
        break;

      case 'parry':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.setValueAtTime(1350, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.3);
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'drone':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(820, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.16);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
        break;

      case 'vortex':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.45);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
        break;

      case 'malware':
        osc.type = 'square';
        osc.frequency.setValueAtTime(1150, now);
        osc.frequency.setValueAtTime(380, now + 0.08);
        osc.frequency.setValueAtTime(850, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;

      case 'shield':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.25);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;

      case 'powerup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;

      case 'goal':
        [330, 440, 550, 660].forEach((freq, idx) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, now + idx * 0.08);
          g.gain.setValueAtTime(0.2, now + idx * 0.08);
          g.gain.exponentialRampToValueAtTime(0.01, now + 0.5 + idx * 0.08);
          o.connect(g);
          g.connect(this.ctx.destination);
          o.start(now + idx * 0.08);
          o.stop(now + 0.5 + idx * 0.08);
        });
        break;

      case 'countdown_tick':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
        break;

      case 'countdown_start':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1040, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;

      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
        break;
    }
  }
}

const sfx = new SynthAudioEngine();
window.addEventListener('click', () => sfx.init(), { once: true });
window.addEventListener('keydown', () => sfx.init(), { once: true });
window.addEventListener('touchstart', () => sfx.init(), { once: true });

function animateEqualizer() {
  eqBars.forEach((bar) => {
    const height = Math.floor(Math.random() * 10 + 2);
    bar.style.height = `${height}px`;
  });
}

// ============================================================================
// 2. SETTINGS TOOLBAR HANDLERS
// ============================================================================
btnToggleBgm.addEventListener('click', () => {
  sfx.init();
  isBgmEnabled = !isBgmEnabled;
  btnToggleBgm.classList.toggle('active', isBgmEnabled);
  btnToggleBgm.innerText = isBgmEnabled ? '🎵 BGM: ON' : '🎵 BGM: OFF';
  if (isBgmEnabled) sfx.startBgm();
  else sfx.stopBgm();
});

btnToggleSfx.addEventListener('click', () => {
  isSfxEnabled = !isSfxEnabled;
  btnToggleSfx.classList.toggle('active', isSfxEnabled);
  btnToggleSfx.innerText = isSfxEnabled ? '🔊 SFX: ON' : '🔇 SFX: OFF';
  if (isSfxEnabled) sfx.playSfx('click');
});

btnToggleCrt.addEventListener('click', () => {
  isCrtEnabled = !isCrtEnabled;
  btnToggleCrt.classList.toggle('active', isCrtEnabled);
  btnToggleCrt.innerText = isCrtEnabled ? '📺 CRT: ON' : '📺 CRT: OFF';
  crtOverlay.classList.toggle('disabled', !isCrtEnabled);
});

btnOpenCodexToolbar.addEventListener('click', () => {
  modalCodex.classList.remove('hidden');
  sfx.playSfx('click');
});

// ============================================================================
// 3. PARTICLES, SHOCKWAVES & FX
// ============================================================================
class Particle {
  constructor(x, y, color, speed = 6) {
    this.x = x;
    this.y = y;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * speed + 1;
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.life = 1.0;
    this.decay = Math.random() * 0.035 + 0.02;
    this.size = Math.random() * 3 + 2;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
    this.size *= 0.96;
  }
  draw(ctx, scaleX, scaleY) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x * scaleX, this.y * scaleY, Math.max(0.5, this.size * scaleX), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Shockwave {
  constructor(x, y, maxRadius, color) {
    this.x = x;
    this.y = y;
    this.radius = 4;
    this.maxRadius = maxRadius;
    this.color = color;
    this.alpha = 1.0;
  }
  update() {
    this.radius += (this.maxRadius - this.radius) * 0.14 + 3;
    this.alpha = 1 - this.radius / this.maxRadius;
  }
  draw(ctx, scaleX, scaleY) {
    if (this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.strokeStyle = this.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x * scaleX, this.y * scaleY, this.radius * scaleX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

class FloatText {
  constructor(text, x, y, color) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.color = color;
    this.life = 1.0;
    this.vy = -1.5;
  }
  update() {
    this.y += this.vy;
    this.life -= 0.02;
  }
  draw(ctx, scaleX, scaleY) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.font = 'bold 1.15rem "Orbitron", sans-serif';
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x * scaleX, this.y * scaleY);
    ctx.restore();
  }
}

function spawnBurst(x, y, color, count = 20, spd = 6) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color, spd));
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function triggerComboCallout(text) {
  comboText.innerText = text;
  comboBanner.classList.remove('hidden');
  setTimeout(() => comboBanner.classList.add('hidden'), 900);
}

// ============================================================================
// 4. SCREEN VIEW SWITCHING
// ============================================================================
function switchScreen(screenId) {
  [screenMenu, screenLobby, screenHud, screenMatchEnd].forEach((el) => {
    el.classList.remove('active');
  });
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
  currentScreen = screenId;
}

// Color Picker
colorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    colorButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedColor = btn.dataset.color;
    sfx.playSfx('click');
  });
});

// Codex Modals
btnOpenCodex.addEventListener('click', () => {
  modalCodex.classList.remove('hidden');
  sfx.playSfx('click');
});
btnCloseCodex.addEventListener('click', () => {
  modalCodex.classList.add('hidden');
  sfx.playSfx('click');
});

// Copy Code Button
btnCopyCode.addEventListener('click', () => {
  if (!myRoomCode) return;
  navigator.clipboard
    .writeText(myRoomCode)
    .then(() => {
      showToast(`COPIED ROOM CODE: ${myRoomCode}`);
      sfx.playSfx('click');
    })
    .catch(() => {
      showToast(`ROOM CODE: ${myRoomCode}`);
    });
});

// ============================================================================
// 5. MATCHMAKING, SOLO AI & LOBBY INTERACTIONS
// ============================================================================
// 1. Quick Matchmaking Queue
btnQuickMatch.addEventListener('click', () => {
  sfx.init();
  sfx.playSfx('click');
  const name = inputPlayerName.value.trim() || 'PILOT_ACE';

  if (!isQueueingMatch) {
    isQueueingMatch = true;
    quickMatchText.innerText = '🔍 SEARCHING OPPONENT... (CLICK TO CANCEL)';
    btnQuickMatch.classList.add('active-ready');
    socket.emit('matchmaking:queue', { playerName: name, color: selectedColor });
  } else {
    isQueueingMatch = false;
    quickMatchText.innerText = '⚡ QUICK MATCH // FIND OPPONENT';
    btnQuickMatch.classList.remove('active-ready');
    socket.emit('matchmaking:cancel');
    showToast('MATCHMAKING CANCELLED');
  }
});

socket.on('matchmaking:waiting', () => {
  showToast('SCANNING CYBER GRID FOR OPPONENTS...');
});

// 2. Solo vs AI
btnSoloAi.addEventListener('click', () => {
  sfx.init();
  sfx.playSfx('click');
  const name = inputPlayerName.value.trim() || 'HUMAN_PILOT';
  socket.emit('room:create_solo', { playerName: name, color: selectedColor });
});

// 3. Create Custom Room
btnCreateRoom.addEventListener('click', () => {
  sfx.init();
  sfx.playSfx('click');
  const name = inputPlayerName.value.trim() || 'HOST_ONE';
  socket.emit('room:create', { playerName: name, color: selectedColor });
});

// 4. Join Custom Room
btnJoinRoom.addEventListener('click', () => {
  sfx.init();
  sfx.playSfx('click');
  const code = inputJoinCode.value.trim().toUpperCase();
  if (!code) {
    showToast('PLEASE ENTER A VALID ROOM CODE');
    return;
  }
  const name = inputPlayerName.value.trim() || 'GUEST_TWO';
  const token = sessionStorage.getItem(`token_${code}`);
  socket.emit('room:join', { roomCode: code, playerName: name, color: selectedColor, reconnectToken: token });
});

// 5. Ready Toggle
btnReadyToggle.addEventListener('click', () => {
  sfx.playSfx('click');
  isReady = !isReady;
  btnReadyToggle.classList.toggle('active-ready', isReady);
  btnReadyToggle.querySelector('.btn-text').innerText = isReady ? 'WAITING FOR CLASH' : 'READY FOR CLASH';
  socket.emit('player:ready', { ready: isReady });
});

if (btnAddBot) {
  btnAddBot.addEventListener('click', () => {
    sfx.playSfx('click');
    socket.emit('room:add_bot');
  });
}

// 6. Leave Room / Match
btnLeaveLobby.addEventListener('click', leaveRoomAndReset);
btnLeaveMatch.addEventListener('click', leaveRoomAndReset);

function leaveRoomAndReset() {
  sfx.playSfx('click');
  socket.emit('room:leave');
  resetClientState();
  switchScreen('screen-menu');
}

btnRematch.addEventListener('click', () => {
  sfx.playSfx('click');
  socket.emit('rematch:request');
  btnRematch.disabled = true;
  rematchBtnText.innerText = 'REMATCH REQUESTED...';
});

function resetClientState() {
  myRole = null;
  myRoomCode = null;
  isReady = false;
  isQueueingMatch = false;
  latestSnapshot = null;
  localPaddleY = ARENA_HEIGHT / 2 - 55;
  currentYRatio = 0.5;
  lastSentInputRatio = -1;
  for (const k in activeKeys) activeKeys[k] = false;
  quickMatchText.innerText = '⚡ QUICK MATCH // FIND OPPONENT';
  btnQuickMatch.classList.remove('active-ready');
  btnReadyToggle.disabled = true;
  btnReadyToggle.classList.remove('active-ready');
  btnReadyToggle.querySelector('.btn-text').innerText = 'READY FOR CLASH';
  if (btnAddBot) btnAddBot.classList.remove('hidden');
  btnRematch.disabled = false;
  rematchBtnText.innerText = 'REMATCH (0/2)';
  spectatorHudBadge.classList.add('hidden');
  disconnectOverlay.classList.add('hidden');
  countdownOverlay.classList.add('hidden');
  comboBanner.classList.add('hidden');
}

// ============================================================================
// 6. INPUT HANDLING (PADDLE & ABILITIES) — 0MS PREDICTION & CONTINUOUS 60FPS KEYS
// ============================================================================
const activeKeys = {};
let localPaddleY = ARENA_HEIGHT / 2 - 55;
let currentYRatio = 0.5;
let lastSentInputRatio = -1;
let lastSentInputTime = 0;
const KEY_MOVE_SPEED = 750; // Snappy & ultra-responsive
let lastFrameTime = performance.now();

function getLocalPaddleHeight() {
  if (myRole && latestSnapshot && latestSnapshot.paddles[myRole]) {
    return latestSnapshot.paddles[myRole].height;
  }
  return 110;
}

function emitPaddleRatio(ratio) {
  const now = performance.now();
  currentYRatio = Math.max(0, Math.min(1, ratio));
  if ((Math.abs(ratio - lastSentInputRatio) > 0.002 && (now - lastSentInputTime >= 15)) || (now - lastSentInputTime >= 120)) {
    lastSentInputTime = now;
    lastSentInputRatio = ratio;
    socket.emit('player:input', { yRatio: ratio });
  }
}

function sendPaddleInput(clientY) {
  if (currentScreen !== 'screen-hud' || myRole === 'spectator') return;
  const rect = canvas.getBoundingClientRect();
  const relY = clientY - rect.top;
  const myHeight = getLocalPaddleHeight();
  const paddleScreenHeight = (myHeight / ARENA_HEIGHT) * rect.height;

  // Center paddle directly under pointer
  let ratio;
  if (rect.height > paddleScreenHeight) {
    ratio = (relY - paddleScreenHeight / 2) / (rect.height - paddleScreenHeight);
  } else {
    ratio = relY / rect.height;
  }
  ratio = Math.max(0, Math.min(1, ratio));

  const maxTravel = ARENA_HEIGHT - myHeight;
  localPaddleY = ratio * maxTravel;
  emitPaddleRatio(ratio);
}

window.addEventListener('mousemove', (e) => sendPaddleInput(e.clientY));
window.addEventListener('touchmove', (e) => {
  if (currentScreen === 'screen-hud') {
    e.preventDefault();
  }
  if (e.touches.length > 0) sendPaddleInput(e.touches[0].clientY);
}, { passive: false });
window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) sendPaddleInput(e.touches[0].clientY);
}, { passive: true });

// Keyboard state listeners (Continuous Polling in renderLoop)
window.addEventListener('keydown', (e) => {
  activeKeys[e.code] = true;

  if (currentScreen !== 'screen-hud' || myRole === 'spectator') return;

  // Ability Hotkeys (No conflict with W/S movement)
  if (e.code === 'Space' || e.code === 'Digit1') triggerAbility('smash');
  else if (e.code === 'KeyQ' || e.code === 'Digit2') triggerAbility('drone');
  else if (e.code === 'Digit3' || e.code === 'KeyF') triggerAbility('vortex');
  else if (e.code === 'KeyE' || e.code === 'Digit4') triggerAbility('malware');
  else if (e.code === 'KeyR' || e.code === 'Digit5') triggerAbility('shield');
});

window.addEventListener('keyup', (e) => {
  activeKeys[e.code] = false;
});

window.addEventListener('blur', () => {
  for (const k in activeKeys) activeKeys[k] = false;
});

abilityButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    triggerAbility(btn.dataset.ability);
  });
});

function triggerAbility(abilityName) {
  if (currentScreen !== 'screen-hud' || myRole === 'spectator') return;
  socket.emit('player:ability', { ability: abilityName });
}

// ============================================================================
// 7. SOCKET.IO MULTIPLAYER EVENT HANDLERS
// ============================================================================
// Latency Tracker
setInterval(() => {
  if (socket.connected) {
    socket.emit('client:ping', Date.now());
  }
}, 1000);

socket.on('server:pong', (startTs) => {
  const latency = Date.now() - startTs;
  pingIndicator.innerText = `PING: ${latency} ms`;
});

// Room Joined
socket.on('room:joined', ({ roomCode, role, sessionToken, lobby }) => {
  myRoomCode = roomCode;
  myRole = role;
  isQueueingMatch = false;
  quickMatchText.innerText = '⚡ QUICK MATCH // FIND OPPONENT';
  btnQuickMatch.classList.remove('active-ready');

  if (sessionToken) {
    sessionStorage.setItem(`token_${roomCode}`, sessionToken);
  }

  lobbyRoomCode.innerText = roomCode;
  updateLobbyUI(lobby);
  switchScreen('screen-lobby');

  if (role === 'spectator') {
    spectatorHudBadge.classList.remove('hidden');
    showToast(`WATCHING ROOM: ${roomCode} AS LIVE SPECTATOR`);
  } else {
    showToast(`JOINED ROOM: ${roomCode} AS ${role.toUpperCase()}`);
  }
});

socket.on('room:error', ({ message }) => showToast(message));

socket.on('room:closed', ({ reason }) => {
  showToast(reason);
  resetClientState();
  switchScreen('screen-menu');
});

socket.on('lobby:updated', (lobby) => updateLobbyUI(lobby));

function updateLobbyUI(lobby) {
  if (!lobby) return;

  spectatorsBadge.innerText = `👁️ ${lobby.spectatorsCount || 0} SPECTATORS WATCHING`;

  if (lobby.host) {
    hostNameEl.innerText = lobby.host.name;
    hostPreviewPaddle.style.background = lobby.host.color;
    hostPreviewPaddle.style.boxShadow = `0 0 15px ${lobby.host.color}`;
    hostReadyTag.innerText = lobby.host.ready ? 'READY' : 'NOT READY';
    hostReadyTag.classList.toggle('is-ready', lobby.host.ready);
  }

  if (lobby.guest) {
    guestNameEl.innerText = lobby.guest.name;
    guestPreviewPaddle.style.background = lobby.guest.color;
    guestPreviewPaddle.style.boxShadow = `0 0 15px ${lobby.guest.color}`;
    guestReadyTag.innerText = lobby.guest.ready ? 'READY' : 'NOT READY';
    guestReadyTag.classList.toggle('is-ready', lobby.guest.ready);
    btnReadyToggle.disabled = false;
    if (btnAddBot) btnAddBot.classList.add('hidden');
  } else {
    guestNameEl.innerText = 'WAITING FOR OPPONENT...';
    guestReadyTag.innerText = 'WAITING';
    guestReadyTag.classList.remove('is-ready');
    btnReadyToggle.disabled = true;
    if (btnAddBot) {
      if (myRole === 'host') {
        btnAddBot.classList.remove('hidden');
      } else {
        btnAddBot.classList.add('hidden');
      }
    }
  }
}

// Countdown Sequence
socket.on('countdown:start', ({ countdown }) => {
  localPaddleY = ARENA_HEIGHT / 2 - 55;
  currentYRatio = 0.5;
  lastSentInputRatio = -1;
  switchScreen('screen-hud');
  countdownOverlay.classList.remove('hidden');
  countdownNumber.innerText = countdown;
  sfx.playSfx('countdown_tick');
});

socket.on('countdown:tick', ({ countdown }) => {
  countdownNumber.innerText = countdown;
  if (countdown > 0) {
    sfx.playSfx('countdown_tick');
  } else {
    countdownNumber.innerText = 'ENGAGE!';
    sfx.playSfx('countdown_start');
    setTimeout(() => countdownOverlay.classList.add('hidden'), 600);
  }
});

socket.on('game:started', () => {
  countdownOverlay.classList.add('hidden');
  disconnectOverlay.classList.add('hidden');
  if (currentScreen !== 'screen-hud') switchScreen('screen-hud');
});

// Authoritative Physics Snapshot
socket.on('gameState', (snapshot) => {
  latestSnapshot = snapshot;

  // Process Events
  if (snapshot.events && snapshot.events.length > 0) {
    snapshot.events.forEach((ev) => handleServerEvent(ev));
  }

  // Rally Combos
  if (snapshot.rallyCount !== prevRally) {
    prevRally = snapshot.rallyCount;
    rallyIndicator.innerText = `RALLY: ${prevRally}`;
    if (prevRally === 4) triggerComboCallout('⚡ NICE RALLY!');
    else if (prevRally === 8) triggerComboCallout('🔥 HYPER CLASH!');
    else if (prevRally === 12) triggerComboCallout('💥 CYBER OVERDRIVE!');
  }

  // Update HUD Scores
  hudHostScore.innerText = snapshot.paddles.host.score;
  hudGuestScore.innerText = snapshot.paddles.guest.score;

  // Energy & Skills for local player
  if (myRole && snapshot.paddles[myRole]) {
    const myPaddle = snapshot.paddles[myRole];
    const pct = Math.min(100, (myPaddle.energy / 100) * 100);
    energyProgressFill.style.width = `${pct}%`;
    energyNumeric.innerText = `${Math.floor(myPaddle.energy)} / 100`;

    document.getElementById('skill-smash').classList.toggle('ready', myPaddle.energy >= 30);
    document.getElementById('skill-drone').classList.toggle('ready', myPaddle.energy >= 40);
    document.getElementById('skill-vortex').classList.toggle('ready', myPaddle.energy >= 35);
    document.getElementById('skill-malware').classList.toggle('ready', myPaddle.energy >= 45);
    document.getElementById('skill-shield').classList.toggle('ready', myPaddle.energy >= 35);

    document.getElementById('skill-smash').classList.toggle('active-active', myPaddle.smashArmed);
    document.getElementById('skill-drone').classList.toggle('active-active', myPaddle.droneActive);
    document.getElementById('skill-shield').classList.toggle('active-active', myPaddle.shieldActive);
    document.getElementById('skill-vortex').classList.toggle('active-active', snapshot.vortex.active);
    document.getElementById('skill-malware').classList.toggle('active-active', myPaddle.malwareActive);
  }
});

function handleServerEvent(ev) {
  switch (ev.type) {
    case 'hit':
      sfx.playSfx('hit');
      screenShake = 6;
      spawnBurst(ev.x, ev.y, ev.role === 'host' ? '#00ffff' : '#ff0077', 12);
      break;

    case 'smash':
      sfx.playSfx('smash');
      screenShake = 22;
      spawnBurst(ev.x, ev.y, '#ffaa00', 30, 9);
      shockwaves.push(new Shockwave(ev.x, ev.y, 160, '#ffaa00'));
      floatTexts.push(new FloatText('🔥 COMET SMASH!', ev.x, ev.y - 15, '#ffaa00'));
      break;

    case 'parry':
      sfx.playSfx('parry');
      screenShake = 24;
      spawnBurst(ev.x, ev.y, '#00ffcc', 35, 10);
      shockwaves.push(new Shockwave(ev.x, ev.y, 190, '#00ffcc'));
      floatTexts.push(new FloatText('⚡ PARRY CLASH!', ev.x, ev.y - 20, '#00ffcc'));
      break;

    case 'drone_zap':
      sfx.playSfx('drone');
      screenShake = 12;
      spawnBurst(ev.x, ev.y, '#00ffcc', 18);
      shockwaves.push(new Shockwave(ev.x, ev.y, 90, '#00ffcc'));
      floatTexts.push(new FloatText('🤖 DRONE INTERCEPT!', ev.x, ev.y - 20, '#00ffcc'));
      break;

    case 'shield_block':
      sfx.playSfx('shield');
      screenShake = 10;
      shockwaves.push(new Shockwave(ev.x, ev.y, 120, '#00bfff'));
      floatTexts.push(new FloatText('🛡️ SHIELD DEFLECTED!', ev.x, ev.y, '#00bfff'));
      break;

    case 'wall_hit':
      sfx.playSfx('hit');
      spawnBurst(ev.x, ev.y, '#00ffff', 8, 4);
      break;

    case 'powerup_collect':
      sfx.playSfx('powerup');
      screenShake = 14;
      const puColor = ev.powerUpType === 'overclock' ? '#00ffcc' : ev.powerUpType === 'triball' ? '#ff00bb' : '#ffaa00';
      floatTexts.push(new FloatText(`📦 ${ev.powerUpType.toUpperCase()} COLLECTED!`, ARENA_WIDTH / 2, ARENA_HEIGHT * 0.3, puColor));
      break;

    case 'goal':
      sfx.playSfx('goal');
      screenShake = 26;
      const isHostGoal = ev.scorer === 'host';
      const goalColor = isHostGoal ? '#00ffff' : '#ff0077';
      spawnBurst(ev.x, ev.y, goalColor, 42, 10);
      shockwaves.push(new Shockwave(ev.x, ev.y, 250, goalColor));
      floatTexts.push(new FloatText(`GOOOAL! ${ev.scorer.toUpperCase()}`, ARENA_WIDTH / 2, ARENA_HEIGHT / 2, goalColor));
      break;
  }
}

socket.on('ability:activated', (data) => {
  if (data.ability === 'malware') {
    sfx.playSfx('malware');
    screenShake = 16;
    if (data.targetRole === myRole) {
      floatTexts.push(new FloatText('👾 SYSTEM CORRUPTED // CONTROLS INVERTED!', ARENA_WIDTH / 2, ARENA_HEIGHT * 0.35, '#ff0055'));
      showToast('⚠️ WARNING: MALWARE EMP HACK ACTIVE! CONTROLS INVERTED!');
    }
  } else if (data.ability === 'vortex') {
    sfx.playSfx('vortex');
    floatTexts.push(new FloatText('🌀 VORTEX SINGULARITY OPENED!', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 80, '#bb44ff'));
  }
});

// Disconnection
socket.on('opponent:disconnected', ({ reconnectTime }) => {
  disconnectOverlay.classList.remove('hidden');
  disconnectTimerDisplay.innerText = `${reconnectTime}s`;
});

socket.on('opponent:disconnect_tick', ({ reconnectTime }) => {
  disconnectTimerDisplay.innerText = `${reconnectTime}s`;
});

socket.on('opponent:reconnected', () => {
  disconnectOverlay.classList.add('hidden');
  showToast('OPPONENT RECONNECTED // RESUMING BATTLE');
});

// Match End
socket.on('match:ended', ({ winner, isWalkout, maxRally, score, stats }) => {
  switchScreen('screen-match-end');
  const isMeWinner = winner === myRole;

  if (isMeWinner) {
    endMatchStatus.innerText = isWalkout ? 'WALKOUT VICTORY' : 'VICTORY';
    endMatchStatus.className = 'end-headline victory';
    endMatchSub.innerText = isWalkout ? 'OPPONENT FORFEITED' : 'CYBER ARENA CHAMPION';
  } else {
    endMatchStatus.innerText = 'DEFEAT';
    endMatchStatus.className = 'end-headline defeat';
    endMatchSub.innerText = 'SYSTEM OVERRIDDEN';
  }

  endHostScore.innerText = score.host;
  endGuestScore.innerText = score.guest;

  statP1Hits.innerText = stats.host.hits;
  statP2Hits.innerText = stats.guest.hits;
  statP1Smashes.innerText = stats.host.smashes;
  statP2Smashes.innerText = stats.guest.smashes;
  statP1Parries.innerText = stats.host.parries;
  statP2Parries.innerText = stats.guest.parries;
  statP1Energy.innerText = stats.host.energyUsed;
  statP2Energy.innerText = stats.guest.energyUsed;
  statMaxRally.innerText = maxRally;

  btnRematch.disabled = false;
  rematchBtnText.innerText = 'REMATCH (0/2)';
});

socket.on('rematch:vote', () => {
  rematchBtnText.innerText = 'REMATCH (1/2)';
});

// ============================================================================
// 8. CANVAS RENDER LOOP (SYNTHWAVE SUN, MULTI-BALLS, CRATES, TRAILS)
// ============================================================================
let gridOffset = 0;

function renderLoop() {
  requestAnimationFrame(renderLoop);

  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  // 60 FPS Continuous Keyboard Polling for Local Paddle
  if (currentScreen === 'screen-hud' && myRole && myRole !== 'spectator') {
    const myHeight = getLocalPaddleHeight();
    const maxTravel = ARENA_HEIGHT - myHeight;
    let moved = false;

    if (activeKeys['KeyW'] || activeKeys['ArrowUp']) {
      localPaddleY -= KEY_MOVE_SPEED * dt;
      moved = true;
    }
    if (activeKeys['KeyS'] || activeKeys['ArrowDown']) {
      localPaddleY += KEY_MOVE_SPEED * dt;
      moved = true;
    }

    if (localPaddleY < 0) localPaddleY = 0;
    if (localPaddleY > maxTravel) localPaddleY = maxTravel;

    if (moved) {
      const ratio = maxTravel > 0 ? localPaddleY / maxTravel : 0.5;
      emitPaddleRatio(ratio);
    }
  }

  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  const scaleX = canvas.width / ARENA_WIDTH;
  const scaleY = canvas.height / ARENA_HEIGHT;

  // 1. Motion Blur Alpha
  ctx.fillStyle = 'rgba(3, 3, 14, 0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  // Screen shake
  if (screenShake > 0) {
    const rx = (Math.random() - 0.5) * screenShake;
    const ry = (Math.random() - 0.5) * screenShake;
    ctx.translate(rx, ry);
    screenShake *= 0.88;
    if (screenShake < 0.4) screenShake = 0;
  }

  // 2. Synthwave Neon Horizon Sun & Perspective Grid
  drawSynthwaveSun(scaleX, scaleY);
  drawSynthwaveGrid(scaleX, scaleY);

  // 3. Center Court Net
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
  ctx.lineWidth = 3 * scaleX;
  ctx.setLineDash([12 * scaleY, 14 * scaleY]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Interpolation & 0ms Local Prediction
  if (latestSnapshot) {
    // Multi-balls
    renderState.balls = latestSnapshot.balls.map((sb, idx) => {
      const prev = renderState.balls[idx] || { x: sb.x, y: sb.y };
      return {
        x: prev.x + (sb.x - prev.x) * 0.45,
        y: prev.y + (sb.y - prev.y) * 0.45,
        radius: 10,
        isSmash: sb.isSmash
      };
    });

    const ph = latestSnapshot.paddles.host;
    const pg = latestSnapshot.paddles.guest;

    // Host Paddle Position: Local 0ms prediction if host, otherwise server lerp
    if (myRole === 'host') {
      const isMalware = ph.malwareActive;
      const maxTravel = ARENA_HEIGHT - ph.height;
      renderState.paddles.host.y = isMalware ? (maxTravel - localPaddleY) : localPaddleY;
    } else {
      renderState.paddles.host.y += (ph.y - renderState.paddles.host.y) * 0.45;
    }
    renderState.paddles.host.height = ph.height;

    // Guest Paddle Position: Local 0ms prediction if guest, otherwise server lerp
    if (myRole === 'guest') {
      const isMalware = pg.malwareActive;
      const maxTravel = ARENA_HEIGHT - pg.height;
      renderState.paddles.guest.y = isMalware ? (maxTravel - localPaddleY) : localPaddleY;
    } else {
      renderState.paddles.guest.y += (pg.y - renderState.paddles.guest.y) * 0.45;
    }
    renderState.paddles.guest.height = pg.height;

    renderState.drones.host.active = ph.droneActive;
    renderState.drones.host.x = ph.droneX;
    renderState.drones.host.y += (ph.droneY - renderState.drones.host.y) * 0.35;

    renderState.drones.guest.active = pg.droneActive;
    renderState.drones.guest.x = pg.droneX;
    renderState.drones.guest.y += (pg.droneY - renderState.drones.guest.y) * 0.35;

    renderState.vortex.active = latestSnapshot.vortex.active;
    renderState.vortex.x = latestSnapshot.vortex.x;
    renderState.vortex.y = latestSnapshot.vortex.y;
    renderState.vortex.angle = latestSnapshot.vortex.angle;
    renderState.powerUp = latestSnapshot.powerUp;
  }

  // 4. Render Shields
  if (latestSnapshot) {
    if (latestSnapshot.paddles.host.shieldActive) {
      drawAegisShield(18 * scaleX, 0, canvas.height, '#00bfff', scaleX);
    }
    if (latestSnapshot.paddles.guest.shieldActive) {
      drawAegisShield((ARENA_WIDTH - 18) * scaleX, 0, canvas.height, '#ff00aa', scaleX);
    }
  }

  // 5. Render Vortex
  if (renderState.vortex.active) {
    drawSingularityVortex(renderState.vortex.x * scaleX, renderState.vortex.y * scaleY, renderState.vortex.angle, scaleX);
  }

  // 6. Render Mystery Cyber Crate
  if (renderState.powerUp) {
    drawPowerUpCrate(renderState.powerUp.x * scaleX, renderState.powerUp.y * scaleY, renderState.powerUp.type, scaleX);
  }

  // 7. Render Drones
  if (renderState.drones.host.active) {
    drawDrone(renderState.drones.host.x * scaleX, renderState.drones.host.y * scaleY, '#00ffff', scaleX);
  }
  if (renderState.drones.guest.active) {
    drawDrone(renderState.drones.guest.x * scaleX, renderState.drones.guest.y * scaleY, '#ff0077', scaleX);
  }

  // 8. Render Paddles
  drawPaddle(
    renderState.paddles.host.x * scaleX,
    renderState.paddles.host.y * scaleY,
    14 * scaleX,
    renderState.paddles.host.height * scaleY,
    '#00ffff',
    latestSnapshot ? latestSnapshot.paddles.host.smashArmed : false,
    latestSnapshot ? latestSnapshot.paddles.host.malwareActive : false,
    latestSnapshot ? latestSnapshot.paddles.host.overclockActive : false
  );

  drawPaddle(
    renderState.paddles.guest.x * scaleX,
    renderState.paddles.guest.y * scaleY,
    14 * scaleX,
    renderState.paddles.guest.height * scaleY,
    '#ff0077',
    latestSnapshot ? latestSnapshot.paddles.guest.smashArmed : false,
    latestSnapshot ? latestSnapshot.paddles.guest.malwareActive : false,
    latestSnapshot ? latestSnapshot.paddles.guest.overclockActive : false
  );

  // 9. Render Balls
  renderState.balls.forEach((ball, idx) => {
    drawBall(ball, idx, scaleX, scaleY);
  });

  // 10. Render VFX
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    shockwaves[i].update();
    shockwaves[i].draw(ctx, scaleX, scaleY);
    if (shockwaves[i].alpha <= 0) shockwaves.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw(ctx, scaleX, scaleY);
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].update();
    floatTexts[i].draw(ctx, scaleX, scaleY);
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }

  ctx.restore();
}

// Synthwave Sun on the Horizon
function drawSynthwaveSun(scaleX, scaleY) {
  const sunX = canvas.width / 2;
  const sunY = canvas.height * 0.45;
  const sunRadius = 75 * scaleX;

  ctx.save();
  const sunGrad = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
  sunGrad.addColorStop(0, '#ffff00');
  sunGrad.addColorStop(0.5, '#ff0077');
  sunGrad.addColorStop(1, '#660066');

  ctx.fillStyle = sunGrad;
  ctx.shadowBlur = 35;
  ctx.shadowColor = '#ff0077';
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // Horizon horizontal cut lines
  ctx.fillStyle = '#03030c';
  for (let i = 0; i < 6; i++) {
    const barY = sunY + i * (12 * scaleY);
    const barHeight = (i + 1) * (2 * scaleY);
    ctx.fillRect(sunX - sunRadius, barY, sunRadius * 2, barHeight);
  }
  ctx.restore();
}

// Synthwave Perspective Floor Grid
function drawSynthwaveGrid(scaleX, scaleY) {
  gridOffset = (gridOffset + 1.2) % 40;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 0, 119, 0.08)';
  ctx.lineWidth = 1;

  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  for (let x = gridOffset; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.restore();
}

// Draw Paddle with Aura & Buffs
function drawPaddle(x, y, w, h, color, isSmashArmed, isMalware, isOverclock) {
  ctx.save();
  if (isSmashArmed) {
    ctx.fillStyle = 'rgba(255, 170, 0, 0.35)';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ffaa00';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  }

  let finalColor = color;
  if (isSmashArmed) finalColor = '#ffaa00';
  if (isOverclock) finalColor = '#00ffcc';

  ctx.fillStyle = finalColor;
  ctx.shadowBlur = isSmashArmed || isOverclock ? 24 : 16;
  ctx.shadowColor = finalColor;
  ctx.fillRect(x, y, w, h);

  // Sweet spot marker
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 2, y + h * 0.38, w - 4, h * 0.24);

  // Malware Glitch
  if (isMalware) {
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2 + (Math.random() - 0.5) * 4, y, w + 4, h);
  }

  ctx.restore();
}

// Draw Ball and High-Speed Comet Tail
function drawBall(ball, idx, scaleX, scaleY) {
  if (!ballTrails.has(idx)) ballTrails.set(idx, []);
  const trail = ballTrails.get(idx);
  trail.push({ x: ball.x, y: ball.y, isSmash: ball.isSmash });
  if (trail.length > 9) trail.shift();

  for (let i = 0; i < trail.length; i++) {
    const pt = trail[i];
    const alpha = (i + 1) / (trail.length * 2.2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.isSmash ? '#ffaa00' : idx > 0 ? '#ff00bb' : '#00ffff';
    ctx.beginPath();
    ctx.arc(pt.x * scaleX, pt.y * scaleY, ball.radius * scaleX * (0.4 + 0.6 * (i / trail.length)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = ball.isSmash ? '#ffaa00' : idx > 0 ? '#ff00bb' : '#ffffff';
  ctx.shadowBlur = ball.isSmash ? 28 : 16;
  ctx.shadowColor = ball.isSmash ? '#ffaa00' : idx > 0 ? '#ff00bb' : '#00ffff';
  ctx.beginPath();
  ctx.arc(ball.x * scaleX, ball.y * scaleY, ball.radius * scaleX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw Power-Up Mystery Crate
let cratePulse = 0;
function drawPowerUpCrate(x, y, type, scaleX) {
  cratePulse += 0.08;
  const radius = 16 * scaleX;
  let color = '#ffaa00';
  let icon = '⚡';
  if (type === 'triball') {
    color = '#ff00bb';
    icon = '💥';
  } else if (type === 'overclock') {
    color = '#00ffcc';
    icon = '⏩';
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;

  // Rotating diamond
  ctx.rotate(cratePulse);
  ctx.strokeRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);

  // Icon center
  ctx.rotate(-cratePulse);
  ctx.font = `${14 * scaleX}px "Orbitron", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 0, 0);
  ctx.restore();
}

// Draw Drone
let dronePulse = 0;
function drawDrone(x, y, color, scaleX) {
  dronePulse += 0.08;
  const size = 16 * scaleX;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = color;
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;

  ctx.beginPath();
  ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size, dronePulse, dronePulse + Math.PI);
  ctx.stroke();

  ctx.fillStyle = '#ff0055';
  ctx.beginPath();
  ctx.arc(2, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw Vortex
function drawSingularityVortex(x, y, angle, scaleX) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  for (let r = 20; r <= 100; r += 24) {
    ctx.strokeStyle = `rgba(187, 68, 255, ${0.8 - r / 120})`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#bb44ff';
    ctx.beginPath();
    ctx.arc(0, 0, r * scaleX, 0, Math.PI * 1.5);
    ctx.stroke();
  }

  ctx.fillStyle = '#110022';
  ctx.beginPath();
  ctx.arc(0, 0, 16 * scaleX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw Aegis Shield
function drawAegisShield(x, y1, y2, color, scaleX) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6 * scaleX;
  ctx.shadowBlur = 22;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  for (let y = 0; y < y2; y += 35) {
    ctx.strokeRect(x - 5, y, 10, 15);
  }
  ctx.restore();
}

requestAnimationFrame(renderLoop);
