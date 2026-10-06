// ============================================================================
// NEON PONG: CYBER CLASH — CLIENT ENGINE (SOCKET.IO, CANVAS 2D, WEB AUDIO)
// ============================================================================

const socket = io();

// Virtual Arena Dimensions (matches server)
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

// Menu Controls
const inputPlayerName = document.getElementById('player-name');
const btnCreateRoom = document.getElementById('btn-create-room');
const inputJoinCode = document.getElementById('join-room-code');
const btnJoinRoom = document.getElementById('btn-join-room');
const colorButtons = document.querySelectorAll('.color-btn');
const btnOpenCodex = document.getElementById('btn-open-codex');
const btnCloseCodex = document.getElementById('btn-close-codex');

// Lobby Controls
const lobbyRoomCode = document.getElementById('lobby-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const hostNameEl = document.getElementById('host-name');
const guestNameEl = document.getElementById('guest-name');
const hostPreviewPaddle = document.getElementById('host-preview-paddle');
const guestPreviewPaddle = document.getElementById('guest-preview-paddle');
const hostReadyTag = document.getElementById('host-ready-tag');
const guestReadyTag = document.getElementById('guest-ready-tag');
const btnReadyToggle = document.getElementById('btn-ready-toggle');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');

// HUD Elements
const hudHostName = document.getElementById('hud-host-name');
const hudGuestName = document.getElementById('hud-guest-name');
const hudHostScore = document.getElementById('hud-host-score');
const hudGuestScore = document.getElementById('hud-guest-score');
const pingIndicator = document.getElementById('ping-indicator');
const rallyIndicator = document.getElementById('rally-indicator');
const energyProgressFill = document.getElementById('energy-progress-fill');
const energyNumeric = document.getElementById('energy-numeric');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
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
let myRole = null; // 'host' or 'guest'
let myRoomCode = null;
let selectedColor = '#00ffff';
let isReady = false;
let currentScreen = 'screen-menu';
let pingInterval = null;

// Visual Interpolation & Render State
let latestSnapshot = null;
const renderState = {
  ball: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, radius: 10, isSmash: false },
  paddles: {
    host: { x: 35, y: 245, height: 110, color: '#00ffff' },
    guest: { x: ARENA_WIDTH - 49, y: 245, height: 110, color: '#ff0077' }
  },
  drones: {
    host: { x: 160, y: 300, active: false },
    guest: { x: ARENA_WIDTH - 160, y: 300, active: false }
  },
  vortex: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, radius: 110, active: false, angle: 0 }
};

// FX State
let screenShake = 0;
const particles = [];
const shockwaves = [];
const floatTexts = [];
const ballTrail = [];

// ============================================================================
// 1. PROCEDURAL WEB AUDIO SYNTHESIZER
// ============================================================================
class SynthAudioEngine {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(type) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
      case 'hit': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
      case 'smash': {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      case 'parry': {
        // High harmonic ping clash
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1320, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case 'drone': {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(250, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'vortex': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.45);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }
      case 'malware': {
        osc.type = 'square';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.setValueAtTime(350, now + 0.08);
        osc.frequency.setValueAtTime(800, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      case 'shield': {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.25);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }
      case 'goal': {
        // Retro synth harmonic fanfare
        const chord = [330, 440, 550, 660];
        chord.forEach((freq, idx) => {
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
      }
      case 'countdown_tick': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }
      case 'countdown_start': {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1040, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case 'click': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
        break;
      }
    }
  }
}

const sfx = new SynthAudioEngine();
window.addEventListener('click', () => sfx.init(), { once: true });
window.addEventListener('keydown', () => sfx.init(), { once: true });
window.addEventListener('touchstart', () => sfx.init(), { once: true });

// ============================================================================
// 2. PARTICLES & JUICE FX ENGINE
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
    this.alpha = 1 - (this.radius / this.maxRadius);
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

// ============================================================================
// 3. UI SCREEN MANAGEMENT
// ============================================================================
function switchScreen(screenId) {
  [screenMenu, screenLobby, screenHud, screenMatchEnd].forEach(el => {
    el.classList.remove('active');
  });
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
  currentScreen = screenId;
}

// Color Picker handler
colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    colorButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedColor = btn.dataset.color;
    sfx.play('click');
  });
});

// Codex Modal
btnOpenCodex.addEventListener('click', () => {
  modalCodex.classList.remove('hidden');
  sfx.play('click');
});
btnCloseCodex.addEventListener('click', () => {
  modalCodex.classList.add('hidden');
  sfx.play('click');
});

// Copy Code Button
btnCopyCode.addEventListener('click', () => {
  if (!myRoomCode) return;
  navigator.clipboard.writeText(myRoomCode).then(() => {
    showToast(`COPIED ROOM CODE: ${myRoomCode}`);
    sfx.play('click');
  }).catch(() => {
    showToast(`ROOM CODE: ${myRoomCode}`);
  });
});

// ============================================================================
// 4. LOBBY & ROOM ACTIONS
// ============================================================================
btnCreateRoom.addEventListener('click', () => {
  sfx.init();
  sfx.play('click');
  const name = inputPlayerName.value.trim() || 'HOST_ONE';
  socket.emit('room:create', { playerName: name, color: selectedColor });
});

btnJoinRoom.addEventListener('click', () => {
  sfx.init();
  sfx.play('click');
  const code = inputJoinCode.value.trim().toUpperCase();
  if (!code) {
    showToast('PLEASE ENTER A VALID ROOM CODE');
    return;
  }
  const name = inputPlayerName.value.trim() || 'GUEST_TWO';
  socket.emit('room:join', { roomCode: code, playerName: name, color: selectedColor });
});

btnReadyToggle.addEventListener('click', () => {
  sfx.play('click');
  isReady = !isReady;
  btnReadyToggle.classList.toggle('active-ready', isReady);
  btnReadyToggle.querySelector('.btn-text').innerText = isReady ? 'WAITING FOR CLASH' : 'READY FOR CLASH';
  socket.emit('player:ready', { ready: isReady });
});

btnLeaveLobby.addEventListener('click', () => {
  sfx.play('click');
  socket.emit('room:leave');
  resetClientState();
  switchScreen('screen-menu');
});

btnLeaveMatch.addEventListener('click', () => {
  sfx.play('click');
  socket.emit('room:leave');
  resetClientState();
  switchScreen('screen-menu');
});

btnRematch.addEventListener('click', () => {
  sfx.play('click');
  socket.emit('rematch:request');
  btnRematch.disabled = true;
  rematchBtnText.innerText = 'REMATCH REQUESTED...';
});

function resetClientState() {
  myRole = null;
  myRoomCode = null;
  isReady = false;
  latestSnapshot = null;
  btnReadyToggle.disabled = true;
  btnReadyToggle.classList.remove('active-ready');
  btnReadyToggle.querySelector('.btn-text').innerText = 'READY FOR CLASH';
  btnRematch.disabled = false;
  rematchBtnText.innerText = 'REMATCH (0/2)';
  disconnectOverlay.classList.add('hidden');
  countdownOverlay.classList.add('hidden');
}

// ============================================================================
// 5. INPUT DISPATCHER (DESKTOP & MOBILE)
// ============================================================================
function sendPaddleInput(clientY) {
  if (currentScreen !== 'screen-hud') return;
  const rect = canvas.getBoundingClientRect();
  const relY = clientY - rect.top;
  const yRatio = Math.max(0, Math.min(1, relY / rect.height));
  socket.emit('player:input', { yRatio });
}

// Desktop Mouse
window.addEventListener('mousemove', (e) => {
  sendPaddleInput(e.clientY);
});

// Mobile Touch Drag
window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    sendPaddleInput(e.touches[0].clientY);
  }
}, { passive: true });

window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    sendPaddleInput(e.touches[0].clientY);
  }
}, { passive: true });

// Keyboard Paddle Nudge (W/S or Up/Down)
let currentYRatio = 0.5;
window.addEventListener('keydown', (e) => {
  if (currentScreen !== 'screen-hud') return;
  const step = 0.08;
  if (e.code === 'KeyW' || e.code === 'ArrowUp') {
    currentYRatio = Math.max(0, currentYRatio - step);
    socket.emit('player:input', { yRatio: currentYRatio });
  } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
    currentYRatio = Math.min(1, currentYRatio + step);
    socket.emit('player:input', { yRatio: currentYRatio });
  }

  // Ability Hotkeys
  if (e.code === 'Space' || e.code === 'Digit1') triggerAbility('smash');
  else if (e.code === 'KeyQ' || e.code === 'Digit2') triggerAbility('drone');
  else if (e.code === 'KeyW' || e.code === 'Digit3') triggerAbility('vortex');
  else if (e.code === 'KeyE' || e.code === 'Digit4') triggerAbility('malware');
  else if (e.code === 'KeyR' || e.code === 'Digit5') triggerAbility('shield');
});

// Ability Touch Buttons
abilityButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    triggerAbility(btn.dataset.ability);
  });
});

function triggerAbility(abilityName) {
  if (currentScreen !== 'screen-hud') return;
  socket.emit('player:ability', { ability: abilityName });
}

// ============================================================================
// 6. SOCKET.IO EVENT LISTENERS
// ============================================================================
// Ping / Pong Latency Tracker
setInterval(() => {
  if (socket.connected) {
    socket.emit('client:ping', Date.now());
  }
}, 1000);

socket.on('server:pong', (startTs) => {
  const latency = Date.now() - startTs;
  pingIndicator.innerText = `PING: ${latency} ms`;
});

// Room Joined (Host or Guest)
socket.on('room:joined', ({ roomCode, role, lobby }) => {
  myRoomCode = roomCode;
  myRole = role;
  lobbyRoomCode.innerText = roomCode;
  updateLobbyUI(lobby);
  switchScreen('screen-lobby');
  showToast(`JOINED ROOM: ${roomCode} AS ${role.toUpperCase()}`);
});

socket.on('room:error', ({ message }) => {
  showToast(message);
});

socket.on('room:closed', ({ reason }) => {
  showToast(reason);
  resetClientState();
  switchScreen('screen-menu');
});

socket.on('lobby:updated', (lobby) => {
  updateLobbyUI(lobby);
});

function updateLobbyUI(lobby) {
  if (!lobby) return;

  // Host info
  if (lobby.host) {
    hostNameEl.innerText = lobby.host.name;
    hostPreviewPaddle.style.background = lobby.host.color;
    hostPreviewPaddle.style.boxShadow = `0 0 15px ${lobby.host.color}`;
    hostReadyTag.innerText = lobby.host.ready ? 'READY' : 'NOT READY';
    hostReadyTag.classList.toggle('is-ready', lobby.host.ready);
  }

  // Guest info
  if (lobby.guest) {
    guestNameEl.innerText = lobby.guest.name;
    guestPreviewPaddle.style.background = lobby.guest.color;
    guestPreviewPaddle.style.boxShadow = `0 0 15px ${lobby.guest.color}`;
    guestReadyTag.innerText = lobby.guest.ready ? 'READY' : 'NOT READY';
    guestReadyTag.classList.toggle('is-ready', lobby.guest.ready);
    btnReadyToggle.disabled = false;
  } else {
    guestNameEl.innerText = 'WAITING FOR OPPONENT...';
    guestReadyTag.innerText = 'WAITING';
    guestReadyTag.classList.remove('is-ready');
    btnReadyToggle.disabled = true;
  }
}

// Countdown Sequence
socket.on('countdown:start', ({ countdown }) => {
  switchScreen('screen-hud');
  countdownOverlay.classList.remove('hidden');
  countdownNumber.innerText = countdown;
  sfx.play('countdown_tick');
});

socket.on('countdown:tick', ({ countdown }) => {
  countdownNumber.innerText = countdown;
  if (countdown > 0) {
    sfx.play('countdown_tick');
  } else {
    countdownNumber.innerText = 'ENGAGE!';
    sfx.play('countdown_start');
    setTimeout(() => {
      countdownOverlay.classList.add('hidden');
    }, 600);
  }
});

// Game Started
socket.on('game:started', () => {
  countdownOverlay.classList.add('hidden');
  disconnectOverlay.classList.add('hidden');
  if (currentScreen !== 'screen-hud') switchScreen('screen-hud');
});

// Authoritative GameState Snapshot (60 ticks/s)
socket.on('gameState', (snapshot) => {
  latestSnapshot = snapshot;

  // Process server events (sound, text, sparks)
  if (snapshot.events && snapshot.events.length > 0) {
    snapshot.events.forEach(ev => {
      handleServerEvent(ev);
    });
  }

  // Update HUD
  hudHostScore.innerText = snapshot.paddles.host.score;
  hudGuestScore.innerText = snapshot.paddles.guest.score;

  // Energy & Ability Ready States for local player
  const myPaddle = snapshot.paddles[myRole];
  if (myPaddle) {
    const pct = Math.min(100, (myPaddle.energy / 100) * 100);
    energyProgressFill.style.width = `${pct}%`;
    energyNumeric.innerText = `${Math.floor(myPaddle.energy)} / 100`;

    // Ability readiness
    document.getElementById('skill-smash').classList.toggle('ready', myPaddle.energy >= 30);
    document.getElementById('skill-drone').classList.toggle('ready', myPaddle.energy >= 40);
    document.getElementById('skill-vortex').classList.toggle('ready', myPaddle.energy >= 35);
    document.getElementById('skill-malware').classList.toggle('ready', myPaddle.energy >= 45);
    document.getElementById('skill-shield').classList.toggle('ready', myPaddle.energy >= 35);

    // Active glows
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
      sfx.play('hit');
      screenShake = 6;
      spawnBurst(ev.x, ev.y, ev.role === 'host' ? '#00ffff' : '#ff0077', 12);
      break;

    case 'smash':
      sfx.play('smash');
      screenShake = 22;
      spawnBurst(ev.x, ev.y, '#ffaa00', 30, 9);
      shockwaves.push(new Shockwave(ev.x, ev.y, 160, '#ffaa00'));
      floatTexts.push(new FloatText('🔥 COMET SMASH!', ev.x, ev.y - 15, '#ffaa00'));
      break;

    case 'parry':
      sfx.play('parry');
      screenShake = 24;
      spawnBurst(ev.x, ev.y, '#00ffcc', 35, 10);
      shockwaves.push(new Shockwave(ev.x, ev.y, 190, '#00ffcc'));
      floatTexts.push(new FloatText('⚡ PARRY CLASH!', ev.x, ev.y - 20, '#00ffcc'));
      break;

    case 'drone_zap':
      sfx.play('drone');
      screenShake = 12;
      spawnBurst(ev.x, ev.y, '#00ffcc', 18);
      shockwaves.push(new Shockwave(ev.x, ev.y, 90, '#00ffcc'));
      floatTexts.push(new FloatText('🤖 DRONE INTERCEPT!', ev.x, ev.y - 20, '#00ffcc'));
      break;

    case 'shield_block':
      sfx.play('shield');
      screenShake = 10;
      shockwaves.push(new Shockwave(ev.x, ev.y, 120, '#00bfff'));
      floatTexts.push(new FloatText('🛡️ SHIELD DEFLECTED!', ev.x, ev.y, '#00bfff'));
      break;

    case 'wall_hit':
      sfx.play('hit');
      spawnBurst(ev.x, ev.y, '#00ffff', 8, 4);
      break;

    case 'goal':
      sfx.play('goal');
      screenShake = 25;
      const isHostGoal = ev.scorer === 'host';
      const goalColor = isHostGoal ? '#00ffff' : '#ff0077';
      spawnBurst(ev.x, ev.y, goalColor, 40, 10);
      shockwaves.push(new Shockwave(ev.x, ev.y, 250, goalColor));
      floatTexts.push(new FloatText(`GOOOAL! ${ev.scorer.toUpperCase()}`, ARENA_WIDTH / 2, ARENA_HEIGHT / 2, goalColor));
      break;
  }
}

// Ability Activated Broadcast
socket.on('ability:activated', (data) => {
  if (data.ability === 'malware') {
    sfx.play('malware');
    screenShake = 16;
    if (data.targetRole === myRole) {
      floatTexts.push(new FloatText('👾 SYSTEM CORRUPTED // CONTROLS INVERTED!', ARENA_WIDTH / 2, ARENA_HEIGHT * 0.35, '#ff0055'));
      showToast('⚠️ WARNING: MALWARE EMP HACK ACTIVE! INVERTED PADDLE!');
    }
  } else if (data.ability === 'vortex') {
    sfx.play('vortex');
    floatTexts.push(new FloatText('🌀 VORTEX SINGULARITY OPENED!', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 80, '#bb44ff'));
  }
});

// Disconnection Handling
socket.on('opponent:disconnected', ({ role, reconnectTime }) => {
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

// Match Ended
socket.on('match:ended', ({ winner, isWalkout, maxRally, score, stats }) => {
  switchScreen('screen-match-end');
  const isMeWinner = winner === myRole;

  if (isMeWinner) {
    endMatchStatus.innerText = isWalkout ? 'WALKOUT VICTORY' : 'VICTORY';
    endMatchStatus.className = 'end-headline victory';
    endMatchSub.innerText = isWalkout ? 'OPPONENT SURRENDERED' : 'CHAMPION OF CYBER CLASH';
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
// 7. CANVAS 2D RENDER LOOP (WITH RETRO SYNTHWAVE GRID & JUICE)
// ============================================================================
let gridOffset = 0;

function renderLoop() {
  requestAnimationFrame(renderLoop);

  // Resize canvas if dimensions changed
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  const scaleX = canvas.width / ARENA_WIDTH;
  const scaleY = canvas.height / ARENA_HEIGHT;

  // 1. Partial Alpha Trail for Motion Blur Juiciness
  ctx.fillStyle = 'rgba(3, 3, 14, 0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  // Screen shake application
  if (screenShake > 0) {
    const rx = (Math.random() - 0.5) * screenShake;
    const ry = (Math.random() - 0.5) * screenShake;
    ctx.translate(rx, ry);
    screenShake *= 0.88;
    if (screenShake < 0.4) screenShake = 0;
  }

  // 2. Retro Synthwave Perspective Floor Grid
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

  // Interpolation logic if snapshot exists
  if (latestSnapshot) {
    const b = latestSnapshot.ball;
    renderState.ball.x += (b.x - renderState.ball.x) * 0.45;
    renderState.ball.y += (b.y - renderState.ball.y) * 0.45;
    renderState.ball.isSmash = b.isSmash;

    const ph = latestSnapshot.paddles.host;
    const pg = latestSnapshot.paddles.guest;
    renderState.paddles.host.y += (ph.y - renderState.paddles.host.y) * 0.45;
    renderState.paddles.host.height = ph.height;
    renderState.paddles.guest.y += (pg.y - renderState.paddles.guest.y) * 0.45;
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
  }

  // 4. Render Active Shield Walls
  if (latestSnapshot) {
    // Host Shield (left)
    if (latestSnapshot.paddles.host.shieldActive) {
      drawAegisShield(18 * scaleX, 0, canvas.height, '#00bfff', scaleX);
    }
    // Guest Shield (right)
    if (latestSnapshot.paddles.guest.shieldActive) {
      drawAegisShield((ARENA_WIDTH - 18) * scaleX, 0, canvas.height, '#ff00aa', scaleX);
    }
  }

  // 5. Render Singularity Vortex
  if (renderState.vortex.active) {
    drawSingularityVortex(renderState.vortex.x * scaleX, renderState.vortex.y * scaleY, renderState.vortex.angle, scaleX);
  }

  // 6. Render Drones
  if (renderState.drones.host.active) {
    drawDrone(renderState.drones.host.x * scaleX, renderState.drones.host.y * scaleY, '#00ffff', scaleX);
  }
  if (renderState.drones.guest.active) {
    drawDrone(renderState.drones.guest.x * scaleX, renderState.drones.guest.y * scaleY, '#ff0077', scaleX);
  }

  // 7. Render Paddles
  drawPaddle(
    renderState.paddles.host.x * scaleX,
    renderState.paddles.host.y * scaleY,
    14 * scaleX,
    renderState.paddles.host.height * scaleY,
    '#00ffff',
    latestSnapshot ? latestSnapshot.paddles.host.smashArmed : false,
    latestSnapshot ? latestSnapshot.paddles.host.malwareActive : false
  );

  drawPaddle(
    renderState.paddles.guest.x * scaleX,
    renderState.paddles.guest.y * scaleY,
    14 * scaleX,
    renderState.paddles.guest.height * scaleY,
    '#ff0077',
    latestSnapshot ? latestSnapshot.paddles.guest.smashArmed : false,
    latestSnapshot ? latestSnapshot.paddles.guest.malwareActive : false
  );

  // 8. Render Ball & Comet Trail
  drawBall(scaleX, scaleY);

  // 9. Render VFX: Shockwaves, Particles, Float Texts
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

// Draw Synthwave Grid Floor
function drawSynthwaveGrid(scaleX, scaleY) {
  gridOffset = (gridOffset + 1.2) % 40;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 0, 119, 0.08)';
  ctx.lineWidth = 1;

  // Horizontal Grid Lines
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Vertical Moving Grid Lines
  for (let x = gridOffset; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.restore();
}

// Draw Paddle with Neon Glow and Malware Distortion
function drawPaddle(x, y, w, h, color, isSmashArmed, isMalware) {
  ctx.save();
  if (isSmashArmed) {
    ctx.fillStyle = 'rgba(255, 170, 0, 0.35)';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ffaa00';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  }

  ctx.fillStyle = isSmashArmed ? '#ffaa00' : color;
  ctx.shadowBlur = isSmashArmed ? 22 : 16;
  ctx.shadowColor = isSmashArmed ? '#ffaa00' : color;
  ctx.fillRect(x, y, w, h);

  // Sweet-spot marker indicator on paddle
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 2, y + h * 0.38, w - 4, h * 0.24);

  // Malware Glitch Overlay
  if (isMalware) {
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2 + (Math.random() - 0.5) * 4, y, w + 4, h);
  }

  ctx.restore();
}

// Draw Ball and High-Speed Comet Tail
function drawBall(scaleX, scaleY) {
  const ball = renderState.ball;
  ballTrail.push({
    x: ball.x,
    y: ball.y,
    isSmash: ball.isSmash
  });
  if (ballTrail.length > 9) ballTrail.shift();

  // Draw Trail
  for (let i = 0; i < ballTrail.length; i++) {
    const pt = ballTrail[i];
    const alpha = (i + 1) / (ballTrail.length * 2.2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.isSmash ? '#ffaa00' : '#00ffff';
    ctx.beginPath();
    ctx.arc(pt.x * scaleX, pt.y * scaleY, ball.radius * scaleX * (0.4 + 0.6 * (i / ballTrail.length)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw Core Ball
  ctx.save();
  ctx.fillStyle = ball.isSmash ? '#ffaa00' : '#ffffff';
  ctx.shadowBlur = ball.isSmash ? 28 : 16;
  ctx.shadowColor = ball.isSmash ? '#ffaa00' : '#00ffff';
  ctx.beginPath();
  ctx.arc(ball.x * scaleX, ball.y * scaleY, ball.radius * scaleX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw Defense Drone
let dronePulse = 0;
function drawDrone(x, y, color, scaleX) {
  dronePulse += 0.08;
  const size = 16 * scaleX;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = color;
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;

  // Drone Core
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Rotating Wing Rings
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size, dronePulse, dronePulse + Math.PI);
  ctx.stroke();

  // Sensor Eye
  ctx.fillStyle = '#ff0055';
  ctx.beginPath();
  ctx.arc(2, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Draw Singularity Vortex Wormhole
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

  // Core
  ctx.fillStyle = '#110022';
  ctx.beginPath();
  ctx.arc(0, 0, 16 * scaleX, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Draw Aegis Shield Forcefield Wall
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

  // Hex energy dashes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  for (let y = 0; y < y2; y += 35) {
    ctx.strokeRect(x - 5, y, 10, 15);
  }
  ctx.restore();
}

// Start Render Loop
requestAnimationFrame(renderLoop);
