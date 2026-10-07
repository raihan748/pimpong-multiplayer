const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// ============================================================================
// 1. SECURITY HARDENING (HELMET, CSP, RATE LIMITING & ORIGIN CONTROLS)
// ============================================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.socket.io', 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.peerjs.com', 'wss://*.peerjs.com']
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e5, // 100 KB max payload to prevent buffer exhaustion attacks
  pingTimeout: 10000,
  pingInterval: 5000
});

const PORT = process.env.PORT || 3000;

// Arena Constants
const ARENA_WIDTH = 1000;
const ARENA_HEIGHT = 600;
const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;
const WINNING_SCORE = 7;
const MAX_PADDLE_SPEED = 24; // Anti-cheat max px displacement per tick

// In-Memory Storage
const rooms = new Map();
const matchmakingQueue = []; // Array of socket IDs waiting for quick match
const socketRateLimits = new Map(); // Anti-spam tracking

// Anti-Spam / Rate Limiter Helper
function checkRateLimit(socketId, maxPerSec = 75) {
  const now = Date.now();
  let record = socketRateLimits.get(socketId);
  if (!record || now - record.resetTime > 1000) {
    record = { count: 1, resetTime: now };
    socketRateLimits.set(socketId, record);
    return true;
  }
  record.count++;
  return record.count <= maxPerSec;
}

// Input Sanitization Helpers
function sanitizeName(name) {
  if (typeof name !== 'string') return 'PILOT';
  const clean = name.replace(/[^a-zA-Z0-9_\-\. ]/g, '').trim();
  return clean.substring(0, 14) || 'PILOT';
}

function sanitizeColor(color) {
  if (typeof color !== 'string') return '#00ffff';
  const validHex = /^#[0-9a-fA-F]{6}$/;
  return validHex.test(color) ? color : '#00ffff';
}

function sanitizeRoomCode(code) {
  if (typeof code !== 'string') return '';
  return code.toUpperCase().replace(/[^A-Z0-9\-]/g, '').substring(0, 12);
}

// Room Code Generator
function generateRoomCode() {
  const prefixes = ['NEON', 'CYBR', 'GRID', 'VOID', 'SYNTH', 'PULSE', 'APEX', 'ZERO', 'TITAN', 'NEXUS'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const code = `${prefix}-${suffix}`;
  return rooms.has(code) ? generateRoomCode() : code;
}

// Stale Room Cleanup (Reaper every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const isOld = now - room.lastActive > 15 * 60 * 1000;
    const isEmpty = (!room.host || !room.host.connected) && (!room.guest || !room.guest.connected) && room.spectators.size === 0;
    if (isOld || (isEmpty && room.state !== 'IN_GAME')) {
      if (room.loopInterval) clearInterval(room.loopInterval);
      if (room.countdownInterval) clearInterval(room.countdownInterval);
      if (room.disconnectInterval) clearInterval(room.disconnectInterval);
      rooms.delete(code);
    }
  }
}, 60000);

// Initialize Arena Physics
function createInitialPhysics() {
  return {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    balls: [
      {
        id: 'main',
        x: ARENA_WIDTH / 2,
        y: ARENA_HEIGHT / 2,
        vx: 7.5,
        vy: 2.5,
        radius: 10,
        speed: 7.5,
        isSmash: false,
        lastHitBy: null
      }
    ],
    paddles: {
      host: {
        x: 35,
        y: ARENA_HEIGHT / 2 - 55,
        targetY: ARENA_HEIGHT / 2 - 55,
        width: 14,
        baseHeight: 110,
        height: 110,
        score: 0,
        energy: 50,
        maxEnergy: 100,
        smashArmed: false,
        malwareActive: false,
        malwareTimer: 0,
        shieldActive: false,
        shieldTimer: 0,
        shieldHits: 1,
        droneActive: false,
        droneTimer: 0,
        droneX: 160,
        droneY: ARENA_HEIGHT / 2,
        droneSize: 16,
        overclockTimer: 0
      },
      guest: {
        x: ARENA_WIDTH - 35 - 14,
        y: ARENA_HEIGHT / 2 - 55,
        targetY: ARENA_HEIGHT / 2 - 55,
        width: 14,
        baseHeight: 110,
        height: 110,
        score: 0,
        energy: 50,
        maxEnergy: 100,
        smashArmed: false,
        malwareActive: false,
        malwareTimer: 0,
        shieldActive: false,
        shieldTimer: 0,
        shieldHits: 1,
        droneActive: false,
        droneTimer: 0,
        droneX: ARENA_WIDTH - 160,
        droneY: ARENA_HEIGHT / 2,
        droneSize: 16,
        overclockTimer: 0
      }
    },
    vortex: {
      active: false,
      timer: 0,
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      radius: 110,
      angle: 0,
      spawnedBy: null
    },
    powerUp: null, // { x, y, type: 'recharge' | 'triball' | 'overclock', radius: 14, timer: 600 }
    powerUpSpawnCooldown: 600 // 10s cooldown
  };
}

// Reset ball towards target role
function resetBall(room, targetRole = null) {
  const phys = room.physics;
  phys.balls = [
    {
      id: 'main',
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      radius: 10,
      isSmash: false,
      lastHitBy: null
    }
  ];

  let dir = Math.random() < 0.5 ? 1 : -1;
  if (targetRole === 'host') dir = -1;
  if (targetRole === 'guest') dir = 1;

  const baseSpeed = 7.5;
  const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8);
  phys.balls[0].vx = dir * baseSpeed * Math.cos(angle);
  phys.balls[0].vy = baseSpeed * Math.sin(angle);
  phys.balls[0].speed = baseSpeed;
}

// Spawn random mystery power-up orb
function trySpawnPowerUp(phys) {
  if (phys.powerUp || phys.powerUpSpawnCooldown > 0) return;
  const types = ['recharge', 'triball', 'overclock'];
  const type = types[Math.floor(Math.random() * types.length)];
  phys.powerUp = {
    x: ARENA_WIDTH * 0.35 + Math.random() * (ARENA_WIDTH * 0.3),
    y: 80 + Math.random() * (ARENA_HEIGHT - 160),
    type,
    radius: 15,
    timer: 15 * TICK_RATE // 15 seconds lifetime
  };
  phys.powerUpSpawnCooldown = 18 * TICK_RATE; // next spawn in 18s
}

// Authoritative Physics Simulation Loop
function updateRoomPhysics(room) {
  if (room.state !== 'IN_GAME' || room.isPaused) return;

  room.lastActive = Date.now();
  const phys = room.physics;
  const pHost = phys.paddles.host;
  const pGuest = phys.paddles.guest;
  const events = [];

  // Passive Energy Regen (+0.2 energy/sec = 0.00333/tick)
  const passiveRegen = 0.2 / TICK_RATE;
  pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + passiveRegen);
  pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + passiveRegen);

  // AI Logic for Solo Mode
  if (room.isSoloAi && room.guest && room.guest.isBot) {
    updateAiBotLogic(room, pGuest, phys, events);
  }

  // Responsive Paddle Displacement with Velocity Thresholding
  const updatePaddle = (paddle) => {
    let dy = paddle.targetY - paddle.y;
    const maxSpeed = paddle.overclockTimer > 0 ? 65 : 48;
    if (Math.abs(dy) <= maxSpeed) {
      paddle.y = paddle.targetY;
    } else {
      paddle.y += Math.sign(dy) * maxSpeed;
    }
    if (paddle.y < 0) paddle.y = 0;
    if (paddle.y + paddle.height > ARENA_HEIGHT) paddle.y = ARENA_HEIGHT - paddle.height;
  };
  updatePaddle(pHost);
  updatePaddle(pGuest);

  // Overclock Buff Timers
  if (pHost.overclockTimer > 0) pHost.overclockTimer--;
  if (pGuest.overclockTimer > 0) pGuest.overclockTimer--;

  // Malware Status Updates
  if (pHost.malwareTimer > 0) {
    pHost.malwareTimer--;
    pHost.height = pHost.baseHeight * 0.7;
    if (pHost.malwareTimer <= 0) {
      pHost.malwareActive = false;
      pHost.height = pHost.baseHeight;
    }
  }
  if (pGuest.malwareTimer > 0) {
    pGuest.malwareTimer--;
    pGuest.height = pGuest.baseHeight * 0.7;
    if (pGuest.malwareTimer <= 0) {
      pGuest.malwareActive = false;
      pGuest.height = pGuest.baseHeight;
    }
  }

  // Shield Updates
  if (pHost.shieldTimer > 0) {
    pHost.shieldTimer--;
    if (pHost.shieldTimer <= 0) pHost.shieldActive = false;
  }
  if (pGuest.shieldTimer > 0) {
    pGuest.shieldTimer--;
    if (pGuest.shieldTimer <= 0) pGuest.shieldActive = false;
  }

  // Drone Updates
  const updateDrone = (paddle, role, defaultX, isTowards) => {
    if (paddle.droneTimer > 0) {
      paddle.droneTimer--;
      let targetDroneY = ARENA_HEIGHT / 2;
      let fastestBall = null;
      let maxSpeed = 0;

      for (const b of phys.balls) {
        if (isTowards(b) && Math.abs(b.vx) > maxSpeed) {
          maxSpeed = Math.abs(b.vx);
          fastestBall = b;
        }
      }
      if (fastestBall) targetDroneY = fastestBall.y;

      paddle.droneY += (targetDroneY - paddle.droneY) * 0.18;

      // Drone Interceptions
      for (const b of phys.balls) {
        const ddx = b.x - paddle.droneX;
        const ddy = b.y - paddle.droneY;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist <= paddle.droneSize + b.radius && isTowards(b)) {
          b.vx = (role === 'host' ? 1 : -1) * (Math.abs(b.vx) * 1.25 + 1.5);
          b.vy = (Math.random() - 0.5) * 8;
          b.lastHitBy = role;
          room[role].stats.hits++;
          events.push({ type: 'drone_zap', x: paddle.droneX, y: paddle.droneY, role });
        }
      }
      if (paddle.droneTimer <= 0) paddle.droneActive = false;
    }
  };

  updateDrone(pHost, 'host', 160, (b) => b.vx < 0);
  updateDrone(pGuest, 'guest', ARENA_WIDTH - 160, (b) => b.vx > 0);

  // Vortex Singularity Update
  if (phys.vortex.active) {
    phys.vortex.timer--;
    phys.vortex.angle += 0.06;
    phys.vortex.y = ARENA_HEIGHT / 2 + Math.sin(phys.vortex.angle) * 75;

    for (const b of phys.balls) {
      const vdx = phys.vortex.x - b.x;
      const vdy = phys.vortex.y - b.y;
      const dist = Math.sqrt(vdx * vdx + vdy * vdy);
      if (dist < 260 && dist > 15) {
        const force = (1 - dist / 260) * 1.5;
        b.vx += (vdx / dist) * force * 0.6;
        b.vy += (vdy / dist) * force * 1.2;
      }
    }
    if (phys.vortex.timer <= 0) phys.vortex.active = false;
  }

  // Power-Up Management
  if (phys.powerUpSpawnCooldown > 0) phys.powerUpSpawnCooldown--;
  trySpawnPowerUp(phys);

  if (phys.powerUp) {
    phys.powerUp.timer--;
    // Check if any ball touches the power-up crate
    for (const b of phys.balls) {
      const pdx = b.x - phys.powerUp.x;
      const pdy = b.y - phys.powerUp.y;
      const dist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (dist <= phys.powerUp.radius + b.radius) {
        const collectorRole = b.lastHitBy || (b.vx > 0 ? 'host' : 'guest');
        applyPowerUp(collectorRole, phys.powerUp.type, room, events);
        phys.powerUp = null;
        break;
      }
    }
    if (phys.powerUp && phys.powerUp.timer <= 0) phys.powerUp = null;
  }

  // Balls Physics & Collisions
  for (let i = phys.balls.length - 1; i >= 0; i--) {
    const ball = phys.balls[i];
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Top / Bottom Wall Bounces
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      events.push({ type: 'wall_hit', x: ball.x, y: 0 });
    } else if (ball.y + ball.radius >= ARENA_HEIGHT) {
      ball.y = ARENA_HEIGHT - ball.radius;
      ball.vy = -Math.abs(ball.vy);
      events.push({ type: 'wall_hit', x: ball.x, y: ARENA_HEIGHT });
    }

    // Aegis Shield Collisions
    if (pHost.shieldActive && ball.vx < 0 && ball.x - ball.radius <= 18) {
      ball.vx = Math.abs(ball.vx) * 1.1 + 1;
      ball.x = 22 + ball.radius;
      pHost.shieldHits--;
      if (pHost.shieldHits <= 0) {
        pHost.shieldActive = false;
        pHost.shieldTimer = 0;
      }
      events.push({ type: 'shield_block', x: 18, y: ball.y, role: 'host' });
    }
    if (pGuest.shieldActive && ball.vx > 0 && ball.x + ball.radius >= ARENA_WIDTH - 18) {
      ball.vx = -Math.abs(ball.vx) * 1.1 - 1;
      ball.x = ARENA_WIDTH - 22 - ball.radius;
      pGuest.shieldHits--;
      if (pGuest.shieldHits <= 0) {
        pGuest.shieldActive = false;
        pGuest.shieldTimer = 0;
      }
      events.push({ type: 'shield_block', x: ARENA_WIDTH - 18, y: ball.y, role: 'guest' });
    }

    // Host Paddle Collision
    if (
      ball.vx < 0 &&
      ball.x - ball.radius <= pHost.x + pHost.width &&
      ball.x + ball.radius >= pHost.x &&
      ball.y + ball.radius >= pHost.y &&
      ball.y - ball.radius <= pHost.y + pHost.height
    ) {
      const paddleCenter = pHost.y + pHost.height / 2;
      const hitOffset = (ball.y - paddleCenter) / (pHost.height / 2);
      const angle = hitOffset * (Math.PI / 3.4);

      room.rallyCount++;
      if (room.rallyCount > room.maxRally) room.maxRally = room.rallyCount;
      room.host.stats.hits++;

      // Check Parry Clash
      const isSweetSpot = Math.abs(hitOffset) <= 0.28;
      if (ball.isSmash && ball.lastHitBy === 'guest' && isSweetSpot) {
        ball.isSmash = false;
        const parrySpeed = 17;
        ball.vx = Math.abs(Math.cos(angle) * parrySpeed);
        ball.vy = Math.sin(angle) * parrySpeed;
        pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + 25);
        room.host.stats.parries++;
        events.push({ type: 'parry', x: pHost.x + pHost.width, y: ball.y, role: 'host' });
      } else if (pHost.smashArmed) {
        pHost.smashArmed = false;
        ball.isSmash = true;
        const curSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        const smashSpeed = Math.max(curSpeed * 1.8, 16.5);
        ball.vx = Math.abs(Math.cos(angle) * smashSpeed);
        ball.vy = Math.sin(angle) * smashSpeed;
        pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + 15);
        room.host.stats.smashes++;
        events.push({ type: 'smash', x: pHost.x + pHost.width, y: ball.y, role: 'host' });
      } else {
        ball.isSmash = false;
        const curSpeed = Math.min(Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) + 0.35, 17);
        ball.vx = Math.abs(Math.cos(angle) * curSpeed);
        ball.vy = Math.sin(angle) * curSpeed;
        pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + 15);
        events.push({ type: 'hit', x: pHost.x + pHost.width, y: ball.y, role: 'host' });
      }
      ball.x = pHost.x + pHost.width + ball.radius;
      ball.lastHitBy = 'host';
    }

    // Guest Paddle Collision
    if (
      ball.vx > 0 &&
      ball.x + ball.radius >= pGuest.x &&
      ball.x - ball.radius <= pGuest.x + pGuest.width &&
      ball.y + ball.radius >= pGuest.y &&
      ball.y - ball.radius <= pGuest.y + pGuest.height
    ) {
      const paddleCenter = pGuest.y + pGuest.height / 2;
      const hitOffset = (ball.y - paddleCenter) / (pGuest.height / 2);
      const angle = hitOffset * (Math.PI / 3.4);

      room.rallyCount++;
      if (room.rallyCount > room.maxRally) room.maxRally = room.rallyCount;
      room.guest.stats.hits++;

      // Check Parry Clash
      const isSweetSpot = Math.abs(hitOffset) <= 0.28;
      if (ball.isSmash && ball.lastHitBy === 'host' && isSweetSpot) {
        ball.isSmash = false;
        const parrySpeed = 17;
        ball.vx = -Math.abs(Math.cos(angle) * parrySpeed);
        ball.vy = Math.sin(angle) * parrySpeed;
        pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + 25);
        room.guest.stats.parries++;
        events.push({ type: 'parry', x: pGuest.x, y: ball.y, role: 'guest' });
      } else if (pGuest.smashArmed) {
        pGuest.smashArmed = false;
        ball.isSmash = true;
        const curSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        const smashSpeed = Math.max(curSpeed * 1.8, 16.5);
        ball.vx = -Math.abs(Math.cos(angle) * smashSpeed);
        ball.vy = Math.sin(angle) * smashSpeed;
        pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + 15);
        room.guest.stats.smashes++;
        events.push({ type: 'smash', x: pGuest.x, y: ball.y, role: 'guest' });
      } else {
        ball.isSmash = false;
        const curSpeed = Math.min(Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) + 0.35, 17);
        ball.vx = -Math.abs(Math.cos(angle) * curSpeed);
        ball.vy = Math.sin(angle) * curSpeed;
        pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + 15);
        events.push({ type: 'hit', x: pGuest.x, y: ball.y, role: 'guest' });
      }
      ball.x = pGuest.x - ball.radius;
      ball.lastHitBy = 'guest';
    }

    // Goal Check: Left Wall (Guest Goal)
    if (ball.x + ball.radius < 0) {
      phys.balls.splice(i, 1);
      if (phys.balls.length === 0) {
        pGuest.score++;
        room.guest.stats.goals++;
        pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + 25); // comeback boost
        room.rallyCount = 0;

        events.push({
          type: 'goal',
          scorer: 'guest',
          score: { host: pHost.score, guest: pGuest.score },
          x: 0,
          y: ball.y
        });

        if (pGuest.score >= WINNING_SCORE) {
          endMatch(room, 'guest');
          return;
        } else {
          resetBall(room, 'host');
        }
      }
    }
    // Goal Check: Right Wall (Host Goal)
    else if (ball.x - ball.radius > ARENA_WIDTH) {
      phys.balls.splice(i, 1);
      if (phys.balls.length === 0) {
        pHost.score++;
        room.host.stats.goals++;
        pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + 25); // comeback boost
        room.rallyCount = 0;

        events.push({
          type: 'goal',
          scorer: 'host',
          score: { host: pHost.score, guest: pGuest.score },
          x: ARENA_WIDTH,
          y: ball.y
        });

        if (pHost.score >= WINNING_SCORE) {
          endMatch(room, 'host');
          return;
        } else {
          resetBall(room, 'guest');
        }
      }
    }
  }

  // 60 FPS Snapshot Broadcast
  const snapshot = {
    timestamp: Date.now(),
    rallyCount: room.rallyCount,
    balls: phys.balls.map((b) => ({
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      isSmash: b.isSmash
    })),
    paddles: {
      host: {
        x: pHost.x,
        y: pHost.y,
        height: pHost.height,
        score: pHost.score,
        energy: pHost.energy,
        smashArmed: pHost.smashArmed,
        malwareActive: pHost.malwareActive,
        malwareTimer: pHost.malwareTimer,
        shieldActive: pHost.shieldActive,
        droneActive: pHost.droneActive,
        droneX: pHost.droneX,
        droneY: pHost.droneY,
        overclockActive: pHost.overclockTimer > 0
      },
      guest: {
        x: pGuest.x,
        y: pGuest.y,
        height: pGuest.height,
        score: pGuest.score,
        energy: pGuest.energy,
        smashArmed: pGuest.smashArmed,
        malwareActive: pGuest.malwareActive,
        malwareTimer: pGuest.malwareTimer,
        shieldActive: pGuest.shieldActive,
        droneActive: pGuest.droneActive,
        droneX: pGuest.droneX,
        droneY: pGuest.droneY,
        overclockActive: pGuest.overclockTimer > 0
      }
    },
    vortex: {
      active: phys.vortex.active,
      x: phys.vortex.x,
      y: phys.vortex.y,
      radius: phys.vortex.radius,
      angle: phys.vortex.angle
    },
    powerUp: phys.powerUp,
    events
  };

  io.to(room.id).emit('gameState', snapshot);
}

// Power-Up Collector Logic
function applyPowerUp(role, type, room, events) {
  const paddle = room.physics.paddles[role];
  const phys = room.physics;
  if (!paddle) return;

  switch (type) {
    case 'recharge':
      paddle.energy = Math.min(paddle.maxEnergy, paddle.energy + 40);
      events.push({ type: 'powerup_collect', role, powerUpType: 'recharge' });
      break;
    case 'triball':
      if (phys.balls.length > 0 && phys.balls.length < 5) {
        const lead = phys.balls[0];
        phys.balls.push(
          { ...lead, id: 'clone1', vy: lead.vy - 3 },
          { ...lead, id: 'clone2', vy: lead.vy + 3 }
        );
      }
      events.push({ type: 'powerup_collect', role, powerUpType: 'triball' });
      break;
    case 'overclock':
      paddle.overclockTimer = 10 * TICK_RATE; // 10s speed boost
      events.push({ type: 'powerup_collect', role, powerUpType: 'overclock' });
      break;
  }
}

// Adaptive Bot AI Logic for Solo Practice
function updateAiBotLogic(room, botPaddle, phys, events) {
  let targetY = ARENA_HEIGHT / 2 - botPaddle.height / 2;
  let threatBall = null;
  let maxVx = 0;

  for (const b of phys.balls) {
    if (b.vx > 0 && b.vx > maxVx) {
      maxVx = b.vx;
      threatBall = b;
    }
  }

  if (threatBall) {
    // Predictive intercept
    targetY = threatBall.y - botPaddle.height / 2;
    // Skill usage when energy allows
    if (botPaddle.energy >= 40 && !botPaddle.droneActive && Math.random() < 0.02) {
      botPaddle.energy -= 40;
      botPaddle.droneActive = true;
      botPaddle.droneTimer = 8 * TICK_RATE;
      events.push({ type: 'ability_activated', role: 'guest', ability: 'drone' });
    } else if (threatBall.isSmash && botPaddle.energy >= 35 && !botPaddle.shieldActive) {
      botPaddle.energy -= 35;
      botPaddle.shieldActive = true;
      botPaddle.shieldTimer = 6 * TICK_RATE;
      botPaddle.shieldHits = 1;
      events.push({ type: 'ability_activated', role: 'guest', ability: 'shield' });
    } else if (botPaddle.energy >= 30 && !botPaddle.smashArmed && Math.random() < 0.03) {
      botPaddle.energy -= 30;
      botPaddle.smashArmed = true;
      events.push({ type: 'ability_activated', role: 'guest', ability: 'smash' });
    }
  }

  botPaddle.targetY = targetY;
}

// Start Countdown Sequence
function startCountdown(room) {
  room.state = 'COUNTDOWN';
  room.countdown = 3;
  io.to(room.id).emit('countdown:start', { countdown: room.countdown });

  if (room.countdownInterval) clearInterval(room.countdownInterval);
  room.countdownInterval = setInterval(() => {
    room.countdown--;
    io.to(room.id).emit('countdown:tick', { countdown: room.countdown });

    if (room.countdown <= 0) {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
      startGame(room);
    }
  }, 1000);
}

// Start Match
function startGame(room) {
  room.state = 'IN_GAME';
  room.isPaused = false;
  resetBall(room);

  io.to(room.id).emit('game:started', {
    roomCode: room.id,
    maxScore: WINNING_SCORE,
    physics: { width: ARENA_WIDTH, height: ARENA_HEIGHT }
  });

  if (!room.loopInterval) {
    room.loopInterval = setInterval(() => {
      updateRoomPhysics(room);
    }, TICK_INTERVAL);
  }
}

// End Match
function endMatch(room, winnerRole, isWalkout = false) {
  room.state = 'MATCH_END';
  room.winner = winnerRole;
  if (room.loopInterval) {
    clearInterval(room.loopInterval);
    room.loopInterval = null;
  }
  if (room.countdownInterval) {
    clearInterval(room.countdownInterval);
    room.countdownInterval = null;
  }
  if (room.disconnectInterval) {
    clearInterval(room.disconnectInterval);
    room.disconnectInterval = null;
  }

  const hostStats = room.host ? room.host.stats : {};
  const guestStats = room.guest ? room.guest.stats : {};

  io.to(room.id).emit('match:ended', {
    winner: winnerRole,
    isWalkout,
    maxRally: room.maxRally,
    score: {
      host: room.physics.paddles.host.score,
      guest: room.physics.paddles.guest.score
    },
    stats: { host: hostStats, guest: guestStats }
  });
}

function getLobbyPayload(room) {
  return {
    roomCode: room.id,
    state: room.state,
    isSoloAi: !!room.isSoloAi,
    host: room.host ? {
      name: room.host.name,
      color: room.host.color,
      ready: room.host.ready
    } : null,
    guest: room.guest ? {
      name: room.guest.name,
      color: room.guest.color,
      ready: room.guest.ready,
      isBot: !!room.guest.isBot
    } : null,
    spectatorsCount: room.spectators ? room.spectators.size : 0
  };
}

// ============================================================================
// 2. SOCKET.IO MULTIPLAYER ROUTING & HANDLERS
// ============================================================================
io.on('connection', (socket) => {
  let currentRoomId = null;
  let playerRole = null; // 'host', 'guest', or 'spectator'
  let sessionToken = crypto.randomBytes(16).toString('hex');

  // Latency Ping-Pong Heartbeat
  socket.on('client:ping', (ts) => {
    socket.emit('server:pong', ts);
  });

  // 1. Create Room (Private or Public)
  socket.on('room:create', ({ playerName, color }) => {
    if (!checkRateLimit(socket.id)) return;
    const roomCode = generateRoomCode();
    currentRoomId = roomCode;
    playerRole = 'host';

    const cleanName = sanitizeName(playerName);
    const cleanColor = sanitizeColor(color);

    const room = {
      id: roomCode,
      state: 'LOBBY',
      isPaused: false,
      isSoloAi: false,
      lastActive: Date.now(),
      rallyCount: 0,
      maxRally: 0,
      host: {
        id: socket.id,
        sessionToken,
        name: cleanName,
        color: cleanColor,
        ready: false,
        connected: true,
        stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
      },
      guest: null,
      spectators: new Set(),
      physics: createInitialPhysics(),
      rematchVotes: new Set()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit('room:joined', {
      roomCode,
      role: 'host',
      sessionToken,
      lobby: getLobbyPayload(room)
    });
  });

  // 2. Solo Play vs AI Bot
  socket.on('room:create_solo', ({ playerName, color }) => {
    if (!checkRateLimit(socket.id)) return;
    const roomCode = generateRoomCode();
    currentRoomId = roomCode;
    playerRole = 'host';

    const cleanName = sanitizeName(playerName);
    const cleanColor = sanitizeColor(color);

    const room = {
      id: roomCode,
      state: 'LOBBY',
      isPaused: false,
      isSoloAi: true,
      lastActive: Date.now(),
      rallyCount: 0,
      maxRally: 0,
      host: {
        id: socket.id,
        sessionToken,
        name: cleanName,
        color: cleanColor,
        ready: true,
        connected: true,
        stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
      },
      guest: {
        id: 'bot_guest',
        sessionToken: 'bot_token',
        name: 'CYBER DEITY BOT',
        color: '#ff0055',
        ready: true,
        connected: true,
        isBot: true,
        stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
      },
      spectators: new Set(),
      physics: createInitialPhysics(),
      rematchVotes: new Set()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit('room:joined', {
      roomCode,
      role: 'host',
      sessionToken,
      lobby: getLobbyPayload(room)
    });

    // Auto start countdown immediately for solo play!
    setTimeout(() => {
      startCountdown(room);
    }, 500);
  });

  // 3. Quick Matchmaking Queue
  socket.on('matchmaking:queue', ({ playerName, color }) => {
    if (!checkRateLimit(socket.id)) return;
    const cleanName = sanitizeName(playerName);
    const cleanColor = sanitizeColor(color);

    // If opponent already queued
    if (matchmakingQueue.length > 0) {
      const opponent = matchmakingQueue.shift();
      const oppSocket = io.sockets.sockets.get(opponent.socketId);

      if (!oppSocket || !oppSocket.connected) {
        // Stale opponent, retry queueing self
        matchmakingQueue.push({ socketId: socket.id, name: cleanName, color: cleanColor });
        socket.emit('matchmaking:waiting');
        return;
      }

      // Pair both into new room
      const roomCode = generateRoomCode();
      const oppSessionToken = crypto.randomBytes(16).toString('hex');
      const mySessionToken = crypto.randomBytes(16).toString('hex');

      const room = {
        id: roomCode,
        state: 'LOBBY',
        isPaused: false,
        isSoloAi: false,
        lastActive: Date.now(),
        rallyCount: 0,
        maxRally: 0,
        host: {
          id: opponent.socketId,
          sessionToken: oppSessionToken,
          name: opponent.name,
          color: opponent.color,
          ready: true,
          connected: true,
          stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
        },
        guest: {
          id: socket.id,
          sessionToken: mySessionToken,
          name: cleanName,
          color: cleanColor,
          ready: true,
          connected: true,
          stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
        },
        spectators: new Set(),
        physics: createInitialPhysics(),
        rematchVotes: new Set()
      };

      rooms.set(roomCode, room);
      oppSocket.join(roomCode);
      socket.join(roomCode);

      oppSocket.emit('room:joined', {
        roomCode,
        role: 'host',
        sessionToken: oppSessionToken,
        lobby: getLobbyPayload(room)
      });

      socket.emit('room:joined', {
        roomCode,
        role: 'guest',
        sessionToken: mySessionToken,
        lobby: getLobbyPayload(room)
      });

      // Quick start
      setTimeout(() => startCountdown(room), 600);
    } else {
      matchmakingQueue.push({ socketId: socket.id, name: cleanName, color: cleanColor });
      socket.emit('matchmaking:waiting');
    }
  });

  // Cancel Matchmaking
  socket.on('matchmaking:cancel', () => {
    const idx = matchmakingQueue.findIndex((q) => q.socketId === socket.id);
    if (idx !== -1) matchmakingQueue.splice(idx, 1);
  });

  // 4. Join Existing Room (Guest or Spectator)
  socket.on('room:join', ({ roomCode, playerName, color, reconnectToken }) => {
    if (!checkRateLimit(socket.id)) return;
    const code = sanitizeRoomCode(roomCode);
    const room = rooms.get(code);

    if (!room) {
      socket.emit('room:error', { message: `Room "${code}" not found!` });
      return;
    }

    // Check Reconnection via Token
    if (reconnectToken) {
      if (room.host && room.host.sessionToken === reconnectToken) {
        room.host.id = socket.id;
        room.host.connected = true;
        currentRoomId = code;
        playerRole = 'host';
        socket.join(code);
        if (room.disconnectInterval) {
          clearInterval(room.disconnectInterval);
          room.disconnectInterval = null;
        }
        room.isPaused = false;
        io.to(code).emit('opponent:reconnected');
        socket.emit('room:joined', { roomCode: code, role: 'host', sessionToken: reconnectToken, lobby: getLobbyPayload(room) });
        return;
      }
      if (room.guest && room.guest.sessionToken === reconnectToken) {
        room.guest.id = socket.id;
        room.guest.connected = true;
        currentRoomId = code;
        playerRole = 'guest';
        socket.join(code);
        if (room.disconnectInterval) {
          clearInterval(room.disconnectInterval);
          room.disconnectInterval = null;
        }
        room.isPaused = false;
        io.to(code).emit('opponent:reconnected');
        socket.emit('room:joined', { roomCode: code, role: 'guest', sessionToken: reconnectToken, lobby: getLobbyPayload(room) });
        return;
      }
    }

    // Normal Guest Join
    if (!room.guest) {
      if (room.state !== 'LOBBY') {
        socket.emit('room:error', { message: 'Match already started in this room!' });
        return;
      }
      currentRoomId = code;
      playerRole = 'guest';

      const cleanName = sanitizeName(playerName);
      const cleanColor = sanitizeColor(color);

      room.guest = {
        id: socket.id,
        sessionToken,
        name: cleanName,
        color: cleanColor,
        ready: false,
        connected: true,
        stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
      };

      socket.join(code);
      socket.emit('room:joined', { roomCode: code, role: 'guest', sessionToken, lobby: getLobbyPayload(room) });
      io.to(code).emit('lobby:updated', getLobbyPayload(room));
      return;
    }

    // Spectator Join
    currentRoomId = code;
    playerRole = 'spectator';
    room.spectators.add(socket.id);
    socket.join(code);
    socket.emit('room:joined', { roomCode: code, role: 'spectator', sessionToken, lobby: getLobbyPayload(room) });
    io.to(code).emit('lobby:updated', getLobbyPayload(room));
  });

  // 5. Ready Toggle
  socket.on('player:ready', ({ ready }) => {
    if (!currentRoomId || !playerRole || !checkRateLimit(socket.id)) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'LOBBY') return;

    if (playerRole === 'host' && room.host) room.host.ready = !!ready;
    if (playerRole === 'guest' && room.guest) room.guest.ready = !!ready;

    io.to(currentRoomId).emit('lobby:updated', getLobbyPayload(room));

    if (room.host && room.guest && room.host.ready && room.guest.ready) {
      startCountdown(room);
    }
  });

  // Host Adds AI Bot into Lobby
  socket.on('room:add_bot', () => {
    if (!currentRoomId || playerRole !== 'host' || !checkRateLimit(socket.id)) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'LOBBY' || room.guest) return;

    room.isSoloAi = true;
    if (room.host) room.host.ready = true;
    room.guest = {
      id: 'bot_guest',
      sessionToken: 'bot_token',
      name: 'CYBER DEITY BOT',
      color: '#ff0055',
      ready: true,
      connected: true,
      isBot: true,
      stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
    };

    io.to(currentRoomId).emit('lobby:updated', getLobbyPayload(room));
    setTimeout(() => {
      startCountdown(room);
    }, 500);
  });

  // 6. Paddle Movement Input
  socket.on('player:input', ({ yRatio }) => {
    if (!currentRoomId || !playerRole || playerRole === 'spectator' || !checkRateLimit(socket.id, 90)) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'IN_GAME') return;

    const paddle = room.physics.paddles[playerRole];
    if (!paddle) return;

    const clampedRatio = Math.max(0, Math.min(1, typeof yRatio === 'number' ? yRatio : 0.5));
    let target = clampedRatio * (ARENA_HEIGHT - paddle.height);

    if (paddle.malwareActive) {
      target = (1.0 - clampedRatio) * (ARENA_HEIGHT - paddle.height);
    }

    paddle.targetY = Math.max(0, Math.min(ARENA_HEIGHT - paddle.height, target));
  });

  // 7. Ability Trigger
  socket.on('player:ability', ({ ability }) => {
    if (!currentRoomId || !playerRole || playerRole === 'spectator' || !checkRateLimit(socket.id, 20)) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'IN_GAME') return;

    const myPaddle = room.physics.paddles[playerRole];
    const opponentRole = playerRole === 'host' ? 'guest' : 'host';
    const opponentPaddle = room.physics.paddles[opponentRole];
    const myStats = room[playerRole] ? room[playerRole].stats : null;

    if (!myPaddle || !myStats) return;

    switch (ability) {
      case 'smash':
        if (myPaddle.energy >= 30 && !myPaddle.smashArmed) {
          myPaddle.energy -= 30;
          myPaddle.smashArmed = true;
          myStats.energyUsed += 30;
          io.to(currentRoomId).emit('ability:activated', { ability: 'smash', role: playerRole });
        }
        break;

      case 'drone':
        if (myPaddle.energy >= 40 && !myPaddle.droneActive) {
          myPaddle.energy -= 40;
          myPaddle.droneActive = true;
          myPaddle.droneTimer = 8 * TICK_RATE;
          myPaddle.droneY = myPaddle.y + myPaddle.height / 2;
          myStats.energyUsed += 40;
          io.to(currentRoomId).emit('ability:activated', { ability: 'drone', role: playerRole });
        }
        break;

      case 'vortex':
        if (myPaddle.energy >= 35 && !room.physics.vortex.active) {
          myPaddle.energy -= 35;
          const vortex = room.physics.vortex;
          vortex.active = true;
          vortex.timer = 6 * TICK_RATE;
          vortex.x = ARENA_WIDTH / 2;
          vortex.y = ARENA_HEIGHT / 2;
          vortex.spawnedBy = playerRole;
          myStats.energyUsed += 35;
          io.to(currentRoomId).emit('ability:activated', { ability: 'vortex', role: playerRole });
        }
        break;

      case 'malware':
        if (myPaddle.energy >= 45 && !opponentPaddle.malwareActive) {
          myPaddle.energy -= 45;
          opponentPaddle.malwareActive = true;
          opponentPaddle.malwareTimer = Math.floor(3.5 * TICK_RATE);
          myStats.energyUsed += 45;
          io.to(currentRoomId).emit('ability:activated', {
            ability: 'malware',
            sourceRole: playerRole,
            targetRole: opponentRole
          });
        }
        break;

      case 'shield':
        if (myPaddle.energy >= 35 && !myPaddle.shieldActive) {
          myPaddle.energy -= 35;
          myPaddle.shieldActive = true;
          myPaddle.shieldTimer = 6 * TICK_RATE;
          myPaddle.shieldHits = 1;
          myStats.energyUsed += 35;
          io.to(currentRoomId).emit('ability:activated', { ability: 'shield', role: playerRole });
        }
        break;
    }
  });

  // 8. Rematch Request
  socket.on('rematch:request', () => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'MATCH_END') return;

    if (room.isSoloAi) {
      // Auto-accept rematch against bot
      room.physics = createInitialPhysics();
      room.host.stats = { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 };
      room.guest.stats = { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 };
      room.rallyCount = 0;
      room.maxRally = 0;
      startCountdown(room);
      return;
    }

    room.rematchVotes.add(playerRole);
    io.to(currentRoomId).emit('rematch:vote', { role: playerRole });

    if (room.rematchVotes.size >= 2) {
      room.rematchVotes.clear();
      room.physics = createInitialPhysics();
      room.host.stats = { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 };
      room.guest.stats = { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 };
      room.rallyCount = 0;
      room.maxRally = 0;
      startCountdown(room);
    }
  });

  // 9. Leave Room
  socket.on('room:leave', () => {
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        if (playerRole === 'spectator') {
          room.spectators.delete(socket.id);
          io.to(currentRoomId).emit('lobby:updated', getLobbyPayload(room));
        } else {
          handlePlayerDisconnect(room, playerRole);
        }
        socket.leave(currentRoomId);
      }
      currentRoomId = null;
      playerRole = null;
    }
  });

  // 10. Disconnect Handling
  socket.on('disconnect', () => {
    // Remove from matchmaking queue if present
    const qIdx = matchmakingQueue.findIndex((q) => q.socketId === socket.id);
    if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);

    socketRateLimits.delete(socket.id);

    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        if (playerRole === 'spectator') {
          room.spectators.delete(socket.id);
          io.to(currentRoomId).emit('lobby:updated', getLobbyPayload(room));
        } else {
          handlePlayerDisconnect(room, playerRole);
        }
      }
    }
  });
});

function handlePlayerDisconnect(room, role) {
  if (room.state === 'IN_GAME' || room.state === 'COUNTDOWN') {
    if (room.isSoloAi) {
      // Discard solo game if player leaves
      rooms.delete(room.id);
      return;
    }

    room.isPaused = true;
    room.disconnectedRole = role;
    room.disconnectCountdown = 15;

    if (role === 'host' && room.host) room.host.connected = false;
    if (role === 'guest' && room.guest) room.guest.connected = false;

    io.to(room.id).emit('opponent:disconnected', {
      role,
      reconnectTime: room.disconnectCountdown
    });

    if (room.disconnectInterval) clearInterval(room.disconnectInterval);
    room.disconnectInterval = setInterval(() => {
      room.disconnectCountdown--;
      io.to(room.id).emit('opponent:disconnect_tick', {
        reconnectTime: room.disconnectCountdown
      });

      if (room.disconnectCountdown <= 0) {
        clearInterval(room.disconnectInterval);
        room.disconnectInterval = null;
        const winnerRole = role === 'host' ? 'guest' : 'host';
        endMatch(room, winnerRole, true);
      }
    }, 1000);
  } else if (room.state === 'LOBBY') {
    if (role === 'guest') {
      room.guest = null;
      io.to(room.id).emit('lobby:updated', getLobbyPayload(room));
    } else if (role === 'host') {
      io.to(room.id).emit('room:closed', { reason: 'Host has left the room.' });
      rooms.delete(room.id);
    }
  }
}

module.exports = { app, server };

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[NEON PONG: CYBER CLASH] Hardened Engine running on port ${PORT}`);
  });
}
