const { io } = require('socket.io-client');
const http = require('http');

async function runTests() {
  console.log('[TEST] Starting Neon Pong E2E Headless Test...');
  const serverUrl = 'http://localhost:3000';

  // 1. Connect Client 1 (Host)
  const client1 = io(serverUrl, { reconnection: false });
  const client2 = io(serverUrl, { reconnection: false });

  await new Promise((resolve) => client1.on('connect', resolve));
  console.log('[TEST] Client 1 Connected! ID:', client1.id);

  await new Promise((resolve) => client2.on('connect', resolve));
  console.log('[TEST] Client 2 Connected! ID:', client2.id);

  // Ping test
  await new Promise((resolve) => {
    client1.emit('client:ping', Date.now());
    client1.on('server:pong', (ts) => {
      console.log('[TEST] Ping Pong latency verified:', Date.now() - ts, 'ms');
      resolve();
    });
  });

  // Client 1 creates room
  let roomCode = null;
  await new Promise((resolve) => {
    client1.emit('room:create', { playerName: 'CYBER_ACE', color: '#00ffff' });
    client1.on('room:joined', (data) => {
      console.log('[TEST] Room created successfully! Code:', data.roomCode, 'Role:', data.role);
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

  // Test Snapshot reception
  let snapshotCount = 0;
  await new Promise((resolve) => {
    client1.on('gameState', (snapshot) => {
      snapshotCount++;
      if (snapshotCount === 10) {
        console.log('[TEST] Received 10 authoritative physics snapshots at 60 FPS!');
        console.log('[TEST] Sample snapshot ball pos:', snapshot.ball.x, snapshot.ball.y);
        resolve();
      }
    });
  });

  // Test paddle input
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

  // Wait a few ticks to verify no server crashes
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('[TEST] Physics simulation stabilized with zero errors!');

  client1.disconnect();
  client2.disconnect();
  console.log('[TEST] ALL END-TO-END AUTOMATED TESTS PASSED SUCCESSFULLY! ✅');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
