import { spawn } from 'node:child_process';
import { startGateway } from './gateway.mjs';
import { migrateCasual } from './migrate-casual.mjs';

await migrateCasual(process.env.DATA_DIR || '/data');
const worker = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '8787', HOSTNAME: '127.0.0.1', NODE_ENV: 'production' }, stdio: 'inherit' });
let stopping = false;
worker.on('exit', code => { if (!stopping) process.exit(code || 1); });
let ready = false;
for (let i = 0; i < 100; i++) {
  try { const r = await fetch('http://127.0.0.1:8787/favicon.svg'); await r.arrayBuffer(); if (r.ok) { ready = true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (!ready) { worker.kill('SIGTERM'); throw new Error('Arena web did not become ready.'); }
const gateway = await startGateway();
function stop() { stopping = true; gateway.close(); worker.kill('SIGTERM'); setTimeout(() => process.exit(0), 1500).unref(); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
console.log(`Arena ready: ${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}`);
