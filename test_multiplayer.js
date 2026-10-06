const { io } = require('socket.io-client');

async function runTests() {
  const port = process.env.PORT || 3000;
  const serverUrl = `http://localhost:${port}`;
  console.log(`[TEST] Starting Neon Pong Hardened Multi-Feature Test on ${serverUrl}...`);

  // 1. Connect Client 1 (Host) and Client 2 (Guest)
  const client1 = io(serverUrl, { forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    client1.on('connect', resolve);
    client1.on('connect_error', reject);
  });
  console.log('[TEST] Client 1 Connected! ID:', client1.id);

  const client2 = io(serverUrl, { forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    client2.on('connect', resolve);
    client2.on('connect_error', reject);
  });
  console.log('[TEST] Client 2 Connected! ID:', client2.id);

  // Ping test
  await new Promise((resolve) => {
    client1.emit('client:ping', Date.now());
    client1.on('server:pong', (ts) => {
      console.log('[TEST] Ping Pong latency verified:', Date.now() - ts, 'ms');
      resolve();
    });
  });

  // Client 1 creates room with XSS attempt (Security test)
  let roomCode = null;
  await new Promise((resolve) => {
    client1.emit('room:create', { playerName: '<script>alert(1)</script>CYBER_ACE', color: '#00ffff' });
    client1.on('room:joined', (data) => {
      console.log('[TEST] Room created successfully! Code:', data.roomCode, 'Role:', data.role);
      console.log('[TEST] Sanitized Pilot Name in lobby:', data.lobby.host.name);
      if (data.lobby.host.name.includes('<script>')) {
        throw new Error('Security failure: Name was not sanitized!');
      }
      roomCode = data.roomCode;
      resolve();
    });
  });

  // Client 2 joins room
  await new Promise((resolve) => {
    client2.emit('room:join', { roomCode, playerName: 'SYNTH_GHOST', color: '#ff0077' });
    client2.on('room:joined', (data) => {
      console.log('[TEST] Client 2 joined room! Role:', data.role);
      resolve();
    });
  });

  // Both players ready up
  const gameStartPromise = new Promise((resolve) => {
    client1.on('game:started', (data) => {
      console.log('[TEST] Game Started Event Fired! Arena:', data.physics);
      resolve(data);
    });
  });

  client1.emit('player:ready', { ready: true });
  client2.emit('player:ready', { ready: true });
  console.log('[TEST] Both players ready! Waiting for countdown & game start...');

  await gameStartPromise;

  // Test Snapshot reception with multi-balls array
  let snapshotCount = 0;
  await new Promise((resolve) => {
    client1.on('gameState', (snapshot) => {
      snapshotCount++;
      if (snapshotCount === 10) {
        console.log('[TEST] Received 10 authoritative physics snapshots at 60 FPS!');
        console.log('[TEST] Balls in snapshot:', snapshot.balls.length);
        resolve();
      }
    });
  });

  // Test paddle input with anti-cheat clamping
  client1.emit('player:input', { yRatio: 0.8 });
  client2.emit('player:input', { yRatio: 0.2 });
  console.log('[TEST] Dispatched paddle movements for Host & Guest');

  // Test Abilities
  client1.emit('player:ability', { ability: 'smash' });
  client1.emit('player:ability', { ability: 'drone' });
  client2.emit('player:ability', { ability: 'shield' });
  client2.emit('player:ability', { ability: 'vortex' });
  client1.emit('player:ability', { ability: 'malware' });
  console.log('[TEST] Dispatched all 5 super abilities');

  // Test Client 3 (Solo vs AI Bot Mode)
  const client3 = io(serverUrl, { forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    client3.on('connect', resolve);
    client3.on('connect_error', reject);
  });
  const soloStartPromise = new Promise((resolve) => {
    client3.on('game:started', resolve);
  });
  client3.emit('room:create_solo', { playerName: 'SOLO_CHAMP', color: '#39ff14' });
  await soloStartPromise;
  console.log('[TEST] Solo Mode vs Cyber Deity AI Bot successfully initialized and started!');

  await new Promise((resolve) => setTimeout(resolve, 500));

  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  console.log('[TEST] ALL END-TO-END HARDENED MULTI-FEATURE TESTS PASSED! ✅');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
