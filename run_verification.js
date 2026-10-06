const { spawn } = require('child_process');

const TEST_PORT = 3567;
const env = { ...process.env, PORT: TEST_PORT };

console.log(`[VERIFY] Spawning server on test port ${TEST_PORT}...`);
const server = spawn('node', ['server.js'], { env, stdio: ['inherit', 'pipe', 'pipe'] });

let serverReady = false;

server.stdout.on('data', (data) => {
  const msg = data.toString();
  process.stdout.write(`SRV: ${msg}`);
  if (msg.includes('Hardened Engine running') && !serverReady) {
    serverReady = true;
    console.log('[VERIFY] Server is ready! Launching headless test runner...');
    const test = spawn('node', ['test_multiplayer.js'], { env, stdio: 'inherit' });
    test.on('exit', (code) => {
      console.log(`[VERIFY] Test finished with exit code ${code}`);
      server.kill();
      process.exit(code);
    });
  }
});

server.stderr.on('data', (data) => {
  process.stderr.write(`SRV ERR: ${data.toString()}`);
});

server.on('exit', (code) => {
  if (!serverReady) {
    console.error(`[VERIFY] Server died prematurely with code ${code}`);
    process.exit(1);
  }
});
