const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// Normalized coordinate space (Virtual Canvas: 1000 x 600)
const ARENA_WIDTH = 1000;
const ARENA_HEIGHT = 600;
const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;
const WINNING_SCORE = 7;

// Active Game Rooms
const rooms = new Map();

// Helper: Generate Cyberpunk Room Code (e.g., NEON-7X, CYBR-42)
function generateRoomCode() {
  const prefixes = ['NEON', 'CYBR', 'GRID', 'VOID', 'SYNTH', 'PULSE', 'APEX', 'ZERO'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const code = `${prefix}-${suffix}`;
  return rooms.has(code) ? generateRoomCode() : code;
}

// Reset ball to center and launch towards target role
function resetBall(room, targetRole = null) {
  const phys = room.physics;
  phys.ball.x = ARENA_WIDTH / 2;
  phys.ball.y = ARENA_HEIGHT / 2;
  phys.ball.radius = 10;
  phys.ball.isSmash = false;
  phys.ball.lastHitBy = null;
  phys.ball.stuckTimer = 0;

  // Decide launch direction
  let dir = Math.random() < 0.5 ? 1 : -1;
  if (targetRole === 'host') dir = -1; // towards left (host)
  if (targetRole === 'guest') dir = 1;  // towards right (guest)

  const baseSpeed = 7.5;
  const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8); // ±22.5 deg
  phys.ball.vx = dir * baseSpeed * Math.cos(angle);
  phys.ball.vy = baseSpeed * Math.sin(angle);
  phys.ball.speed = baseSpeed;
}

// Initialize room physics
function createInitialPhysics() {
  return {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    ball: {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      vx: 7.5,
      vy: 0,
      radius: 10,
      speed: 7.5,
      isSmash: false,
      lastHitBy: null
    },
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
        droneSize: 16
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
        droneSize: 16
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
    }
  };
}

// Server Game Loop for a single room
function updateRoomPhysics(room) {
  if (room.state !== 'IN_GAME' || room.isPaused) return;

  const phys = room.physics;
  const ball = phys.ball;
  const pHost = phys.paddles.host;
  const pGuest = phys.paddles.guest;
  const events = [];

  // 1. Passive Energy Regen (+0.2 energy/sec = +0.2 / 60 = 0.00333/tick)
  const passiveRegen = 0.2 / TICK_RATE;
  pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + passiveRegen);
  pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + passiveRegen);

  // 2. Paddle Movement & Malware Control Inversion
  // Smooth server interpolation towards target position
  const updatePaddlePos = (paddle) => {
    paddle.y += (paddle.targetY - paddle.y) * 0.45;
    if (paddle.y < 0) paddle.y = 0;
    if (paddle.y + paddle.height > ARENA_HEIGHT) paddle.y = ARENA_HEIGHT - paddle.height;
  };
  updatePaddlePos(pHost);
  updatePaddlePos(pGuest);

  // 3. Timers updates for Abilities & Malware
  // Host Malware
  if (pHost.malwareTimer > 0) {
    pHost.malwareTimer--;
    pHost.height = pHost.baseHeight * 0.7; // 30% smaller
    if (pHost.malwareTimer <= 0) {
      pHost.malwareActive = false;
      pHost.height = pHost.baseHeight;
    }
  }
  // Guest Malware
  if (pGuest.malwareTimer > 0) {
    pGuest.malwareTimer--;
    pGuest.height = pGuest.baseHeight * 0.7; // 30% smaller
    if (pGuest.malwareTimer <= 0) {
      pGuest.malwareActive = false;
      pGuest.height = pGuest.baseHeight;
    }
  }

  // Host Shield
  if (pHost.shieldTimer > 0) {
    pHost.shieldTimer--;
    if (pHost.shieldTimer <= 0) pHost.shieldActive = false;
  }
  // Guest Shield
  if (pGuest.shieldTimer > 0) {
    pGuest.shieldTimer--;
    if (pGuest.shieldTimer <= 0) pGuest.shieldActive = false;
  }

  // Host Drone Behavior (tracks ball when ball moving left)
  if (pHost.droneTimer > 0) {
    pHost.droneTimer--;
    const targetDroneY = ball.vx < 0 ? ball.y : ARENA_HEIGHT / 2;
    pHost.droneY += (targetDroneY - pHost.droneY) * 0.16;

    // Drone collision check with ball
    const ddx = ball.x - pHost.droneX;
    const ddy = ball.y - pHost.droneY;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist <= pHost.droneSize + ball.radius && ball.vx < 0) {
      ball.vx = Math.abs(ball.vx) * 1.25 + 1.5;
      ball.vy = (Math.random() - 0.5) * 8;
      ball.lastHitBy = 'host';
      room.host.stats.hits++;
      events.push({ type: 'drone_zap', x: pHost.droneX, y: pHost.droneY, role: 'host' });
    }
    if (pHost.droneTimer <= 0) pHost.droneActive = false;
  }

  // Guest Drone Behavior (tracks ball when ball moving right)
  if (pGuest.droneTimer > 0) {
    pGuest.droneTimer--;
    const targetDroneY = ball.vx > 0 ? ball.y : ARENA_HEIGHT / 2;
    pGuest.droneY += (targetDroneY - pGuest.droneY) * 0.16;

    // Drone collision check with ball
    const ddx = ball.x - pGuest.droneX;
    const ddy = ball.y - pGuest.droneY;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist <= pGuest.droneSize + ball.radius && ball.vx > 0) {
      ball.vx = -Math.abs(ball.vx) * 1.25 - 1.5;
      ball.vy = (Math.random() - 0.5) * 8;
      ball.lastHitBy = 'guest';
      room.guest.stats.hits++;
      events.push({ type: 'drone_zap', x: pGuest.droneX, y: pGuest.droneY, role: 'guest' });
    }
    if (pGuest.droneTimer <= 0) pGuest.droneActive = false;
  }

  // Vortex Singularity Influence
  if (phys.vortex.active) {
    phys.vortex.timer--;
    phys.vortex.angle += 0.06;
    // Oscillate slightly vertically
    phys.vortex.y = ARENA_HEIGHT / 2 + Math.sin(phys.vortex.angle) * 70;

    const vdx = phys.vortex.x - ball.x;
    const vdy = phys.vortex.y - ball.y;
    const dist = Math.sqrt(vdx * vdx + vdy * vdy);
    if (dist < 260 && dist > 15) {
      const force = (1 - dist / 260) * 1.5;
      ball.vx += (vdx / dist) * force * 0.6;
      ball.vy += (vdy / dist) * force * 1.2;
    }

    if (phys.vortex.timer <= 0) {
      phys.vortex.active = false;
    }
  }

  // 4. Ball Movement
  ball.x += ball.vx;
  ball.y += ball.vy;

  // 5. Ball Top & Bottom Boundary Wall Bounce
  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    events.push({ type: 'wall_hit', x: ball.x, y: 0 });
  } else if (ball.y + ball.radius >= ARENA_HEIGHT) {
    ball.y = ARENA_HEIGHT - ball.radius;
    ball.vy = -Math.abs(ball.vy);
    events.push({ type: 'wall_hit', x: ball.x, y: ARENA_HEIGHT });
  }

  // 6. Aegis Shield Protection Collision
  // Host Shield (left goal line, x = 12)
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

  // Guest Shield (right goal line, x = 982)
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

  // 7. Paddle Collisions
  // --- Left Paddle (Host) Hit Check ---
  if (
    ball.vx < 0 &&
    ball.x - ball.radius <= pHost.x + pHost.width &&
    ball.x + ball.radius >= pHost.x &&
    ball.y + ball.radius >= pHost.y &&
    ball.y - ball.radius <= pHost.y + pHost.height
  ) {
    const paddleCenter = pHost.y + pHost.height / 2;
    const hitOffset = (ball.y - paddleCenter) / (pHost.height / 2); // -1 to 1
    const angle = hitOffset * (Math.PI / 3.4); // max ~53 degrees

    room.rallyCount++;
    if (room.rallyCount > room.maxRally) room.maxRally = room.rallyCount;
    room.host.stats.hits++;

    // Check if incoming ball was an opponent's Super Smash -> Counter-play PARRY CLASH!
    const isSweetSpot = Math.abs(hitOffset) <= 0.28;
    if (ball.isSmash && ball.lastHitBy === 'guest' && isSweetSpot) {
      // PARRY SUCCESS!
      ball.isSmash = false;
      const parrySpeed = 16.5;
      ball.vx = Math.abs(Math.cos(angle) * parrySpeed);
      ball.vy = Math.sin(angle) * parrySpeed;
      pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + 25);
      room.host.stats.parries++;
      events.push({ type: 'parry', x: pHost.x + pHost.width, y: ball.y, role: 'host' });
    } else if (pHost.smashArmed) {
      // Trigger Host's Super Comet Smash!
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
      // Normal hit
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

  // --- Right Paddle (Guest) Hit Check ---
  if (
    ball.vx > 0 &&
    ball.x + ball.radius >= pGuest.x &&
    ball.x - ball.radius <= pGuest.x + pGuest.width &&
    ball.y + ball.radius >= pGuest.y &&
    ball.y - ball.radius <= pGuest.y + pGuest.height
  ) {
    const paddleCenter = pGuest.y + pGuest.height / 2;
    const hitOffset = (ball.y - paddleCenter) / (pGuest.height / 2); // -1 to 1
    const angle = hitOffset * (Math.PI / 3.4);

    room.rallyCount++;
    if (room.rallyCount > room.maxRally) room.maxRally = room.rallyCount;
    room.guest.stats.hits++;

    // Check if incoming ball was an opponent's Super Smash -> Counter-play PARRY CLASH!
    const isSweetSpot = Math.abs(hitOffset) <= 0.28;
    if (ball.isSmash && ball.lastHitBy === 'host' && isSweetSpot) {
      // PARRY SUCCESS!
      ball.isSmash = false;
      const parrySpeed = 16.5;
      ball.vx = -Math.abs(Math.cos(angle) * parrySpeed);
      ball.vy = Math.sin(angle) * parrySpeed;
      pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + 25);
      room.guest.stats.parries++;
      events.push({ type: 'parry', x: pGuest.x, y: ball.y, role: 'guest' });
    } else if (pGuest.smashArmed) {
      // Trigger Guest's Super Comet Smash!
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
      // Normal hit
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

  // 8. Goal Detection
  // Ball out on Left (Guest Scores!)
  if (ball.x + ball.radius < 0) {
    pGuest.score++;
    room.guest.stats.goals++;
    // Comeback mechanic: Host conceded goal -> receives +25 energy
    pHost.energy = Math.min(pHost.maxEnergy, pHost.energy + 25);
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
      resetBall(room, 'host'); // launch towards host
    }
  }
  // Ball out on Right (Host Scores!)
  else if (ball.x - ball.radius > ARENA_WIDTH) {
    pHost.score++;
    room.host.stats.goals++;
    // Comeback mechanic: Guest conceded goal -> receives +25 energy
    pGuest.energy = Math.min(pGuest.maxEnergy, pGuest.energy + 25);
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
      resetBall(room, 'guest'); // launch towards guest
    }
  }

  // 9. Snapshot Broadcast (60 ticks/s)
  const snapshot = {
    timestamp: Date.now(),
    ball: {
      x: ball.x,
      y: ball.y,
      vx: ball.vx,
      vy: ball.vy,
      isSmash: ball.isSmash
    },
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
        droneY: pHost.droneY
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
        droneY: pGuest.droneY
      }
    },
    vortex: {
      active: phys.vortex.active,
      x: phys.vortex.x,
      y: phys.vortex.y,
      radius: phys.vortex.radius,
      angle: phys.vortex.angle
    },
    events
  };

  io.to(room.id).emit('gameState', snapshot);
}

// Start Countdown Sequence (3 seconds)
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

// Start Game Loop
function startGame(room) {
  room.state = 'IN_GAME';
  room.isPaused = false;
  resetBall(room);

  io.to(room.id).emit('game:started', {
    roomCode: room.id,
    maxScore: WINNING_SCORE,
    physics: {
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT
    }
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
    stats: {
      host: hostStats,
      guest: guestStats
    }
  });
}

// Handle Player Disconnect with 15s WO Timer
function handlePlayerDisconnect(socket, room, role) {
  if (room.state === 'IN_GAME' || room.state === 'COUNTDOWN') {
    room.isPaused = true;
    room.disconnectedRole = role;
    room.disconnectCountdown = 15;

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
        // Remaining player wins by walkout (WO)
        const winnerRole = role === 'host' ? 'guest' : 'host';
        endMatch(room, winnerRole, true);
      }
    }, 1000);
  } else if (room.state === 'LOBBY') {
    // If guest disconnects in lobby, just reset guest
    if (role === 'guest') {
      room.guest = null;
      io.to(room.id).emit('lobby:updated', getLobbyPayload(room));
    } else if (role === 'host') {
      // Host left lobby -> disband room
      io.to(room.id).emit('room:closed', { reason: 'Host has left the room.' });
      rooms.delete(room.id);
    }
  }
}

function getLobbyPayload(room) {
  return {
    roomCode: room.id,
    state: room.state,
    host: room.host ? {
      name: room.host.name,
      color: room.host.color,
      ready: room.host.ready
    } : null,
    guest: room.guest ? {
      name: room.guest.name,
      color: room.guest.color,
      ready: room.guest.ready
    } : null
  };
}

// WebSocket Event Handlers
io.on('connection', (socket) => {
  let currentRoomId = null;
  let playerRole = null; // 'host' or 'guest'

  // Heartbeat Ping/Pong for Latency Display
  socket.on('client:ping', (timestamp) => {
    socket.emit('server:pong', timestamp);
  });

  // 1. Create Room
  socket.on('room:create', ({ playerName, color }) => {
    const roomCode = generateRoomCode();
    currentRoomId = roomCode;
    playerRole = 'host';

    const room = {
      id: roomCode,
      state: 'LOBBY',
      isPaused: false,
      rallyCount: 0,
      maxRally: 0,
      host: {
        id: socket.id,
        name: (playerName || 'HOST').trim().substring(0, 14),
        color: color || '#00ffff',
        ready: false,
        stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
      },
      guest: null,
      physics: createInitialPhysics(),
      rematchVotes: new Set()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit('room:joined', {
      roomCode,
      role: 'host',
      lobby: getLobbyPayload(room)
    });
  });

  // 2. Join Room
  socket.on('room:join', ({ roomCode, playerName, color }) => {
    const code = (roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('room:error', { message: `Room "${code}" not found!` });
      return;
    }

    // Check reconnection
    if (room.disconnectedRole) {
      const discRole = room.disconnectedRole;
      if (room.disconnectInterval) {
        clearInterval(room.disconnectInterval);
        room.disconnectInterval = null;
      }
      room.disconnectedRole = null;
      currentRoomId = code;
      playerRole = discRole;
      socket.join(code);

      if (discRole === 'host') {
        room.host.id = socket.id;
      } else {
        room.guest.id = socket.id;
      }

      room.isPaused = false;
      io.to(code).emit('opponent:reconnected');
      socket.emit('room:joined', {
        roomCode: code,
        role: discRole,
        lobby: getLobbyPayload(room)
      });
      return;
    }

    if (room.guest) {
      socket.emit('room:error', { message: `Room "${code}" is already full!` });
      return;
    }

    if (room.state !== 'LOBBY') {
      socket.emit('room:error', { message: `Match already in progress in room "${code}"!` });
      return;
    }

    currentRoomId = code;
    playerRole = 'guest';

    room.guest = {
      id: socket.id,
      name: (playerName || 'GUEST').trim().substring(0, 14),
      color: color || '#ff0077',
      ready: false,
      stats: { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 }
    };

    socket.join(code);

    socket.emit('room:joined', {
      roomCode: code,
      role: 'guest',
      lobby: getLobbyPayload(room)
    });

    io.to(code).emit('lobby:updated', getLobbyPayload(room));
  });

  // 3. Player Ready
  socket.on('player:ready', ({ ready }) => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'LOBBY') return;

    if (playerRole === 'host' && room.host) {
      room.host.ready = ready;
    } else if (playerRole === 'guest' && room.guest) {
      room.guest.ready = ready;
    }

    io.to(currentRoomId).emit('lobby:updated', getLobbyPayload(room));

    // Both ready? Start countdown!
    if (room.host && room.guest && room.host.ready && room.guest.ready) {
      startCountdown(room);
    }
  });

  // 4. Player Input (Paddle Y)
  socket.on('player:input', ({ yRatio }) => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'IN_GAME') return;

    const paddle = room.physics.paddles[playerRole];
    if (!paddle) return;

    // Normal ratio: 0.0 to 1.0 -> maps to canvas height - paddle height
    let target = yRatio * (ARENA_HEIGHT - paddle.height);

    // If infected by Malware EMP Hack -> invert controls!
    if (paddle.malwareActive) {
      target = (1.0 - yRatio) * (ARENA_HEIGHT - paddle.height);
    }

    paddle.targetY = Math.max(0, Math.min(ARENA_HEIGHT - paddle.height, target));
  });

  // 5. Player Ability Trigger
  socket.on('player:ability', ({ ability }) => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'IN_GAME') return;

    const myPaddle = room.physics.paddles[playerRole];
    const opponentRole = playerRole === 'host' ? 'guest' : 'host';
    const opponentPaddle = room.physics.paddles[opponentRole];
    const myStats = room[playerRole].stats;

    switch (ability) {
      // 1. Super Comet Smash (Cost: 30 Energy | Key: Space / 1)
      case 'smash':
        if (myPaddle.energy >= 30 && !myPaddle.smashArmed) {
          myPaddle.energy -= 30;
          myPaddle.smashArmed = true;
          myStats.energyUsed += 30;
          io.to(currentRoomId).emit('ability:activated', {
            ability: 'smash',
            role: playerRole
          });
        }
        break;

      // 2. Defense Drone (Cost: 40 Energy | Duration: 8s | Key: Q / 2)
      case 'drone':
        if (myPaddle.energy >= 40 && !myPaddle.droneActive) {
          myPaddle.energy -= 40;
          myPaddle.droneActive = true;
          myPaddle.droneTimer = 8 * TICK_RATE; // 8 seconds
          myPaddle.droneY = myPaddle.y + myPaddle.height / 2;
          myStats.energyUsed += 40;
          io.to(currentRoomId).emit('ability:activated', {
            ability: 'drone',
            role: playerRole
          });
        }
        break;

      // 3. Singularity Vortex (Cost: 35 Energy | Duration: 6s | Key: W / 3)
      case 'vortex':
        if (myPaddle.energy >= 35 && !room.physics.vortex.active) {
          myPaddle.energy -= 35;
          const vortex = room.physics.vortex;
          vortex.active = true;
          vortex.timer = 6 * TICK_RATE; // 6 seconds
          vortex.x = ARENA_WIDTH / 2;
          vortex.y = ARENA_HEIGHT / 2;
          vortex.spawnedBy = playerRole;
          myStats.energyUsed += 35;
          io.to(currentRoomId).emit('ability:activated', {
            ability: 'vortex',
            role: playerRole
          });
        }
        break;

      // 4. Cyber Malware / EMP Hack (Cost: 45 Energy | Duration: 3.5s | Key: E / 4)
      case 'malware':
        if (myPaddle.energy >= 45 && !opponentPaddle.malwareActive) {
          myPaddle.energy -= 45;
          opponentPaddle.malwareActive = true;
          opponentPaddle.malwareTimer = Math.floor(3.5 * TICK_RATE); // 3.5 seconds
          myStats.energyUsed += 45;
          io.to(currentRoomId).emit('ability:activated', {
            ability: 'malware',
            sourceRole: playerRole,
            targetRole: opponentRole
          });
        }
        break;

      // 5. Aegis Energy Shield (Cost: 35 Energy | Duration: 6s / 1 hit | Key: R / 5)
      case 'shield':
        if (myPaddle.energy >= 35 && !myPaddle.shieldActive) {
          myPaddle.energy -= 35;
          myPaddle.shieldActive = true;
          myPaddle.shieldTimer = 6 * TICK_RATE; // 6 seconds
          myPaddle.shieldHits = 1;
          myStats.energyUsed += 35;
          io.to(currentRoomId).emit('ability:activated', {
            ability: 'shield',
            role: playerRole
          });
        }
        break;
    }
  });

  // 6. Rematch Request
  socket.on('rematch:request', () => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.state !== 'MATCH_END') return;

    room.rematchVotes.add(playerRole);
    io.to(currentRoomId).emit('rematch:vote', { role: playerRole });

    if (room.rematchVotes.size >= 2) {
      // Both want rematch! Reset physics & stats
      room.rematchVotes.clear();
      room.physics = createInitialPhysics();
      room.host.stats = { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 };
      room.guest.stats = { hits: 0, smashes: 0, parries: 0, energyUsed: 0, goals: 0 };
      room.rallyCount = 0;
      room.maxRally = 0;
      startCountdown(room);
    }
  });

  // 7. Leave Room
  socket.on('room:leave', () => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      handlePlayerDisconnect(socket, room, playerRole);
      socket.leave(currentRoomId);
    }
    currentRoomId = null;
    playerRole = null;
  });

  // 8. Disconnect
  socket.on('disconnect', () => {
    if (!currentRoomId || !playerRole) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      handlePlayerDisconnect(socket, room, playerRole);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[NEON PONG] Server running on http://localhost:${PORT}`);
});
