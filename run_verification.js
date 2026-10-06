const { spawn } = require('child_process');

console.log('[VERIFY] Starting Neon Pong Server process...');
const serverProc = spawn('node', ['server.js'], { stdio: 'inherit' });

setTimeout(() => {
  console.log('[VERIFY] Launching Test Multiplayer Runner...');
  const testProc = spawn('node', ['test_multiplayer.js'], { stdio: 'inherit' });

  testProc.on('exit', (code) => {
    console.log(`[VERIFY] Test exited with code: ${code}`);
    serverProc.kill();
    process.exit(code);
  });
}, 1500);
