import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, chownSync } from 'node:fs';
const origin = new URL(process.argv[2] || 'https://oan-tu-ti-ai-arena.vercel.app');
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Supply the HTTPS origin of your Vercel site.');
mkdirSync('.secrets', { recursive: true, mode: 0o700 });
if (!existsSync('.secrets/vercel-judge-token')) writeFileSync('.secrets/vercel-judge-token', randomBytes(48).toString('base64url'), { mode: 0o600 });
if (process.platform === 'linux' && process.getuid?.() === 0) chownSync('.secrets/vercel-judge-token', 1000, 1000);
writeFileSync('.env.judge.local', `CONTROL_URL=${origin.origin}\n`, { mode: 0o600 });
console.log('Cloud judge configuration is ready. Store the same secret as JUDGE_TOKEN in Vercel Production, then redeploy. Never commit either local file.');
