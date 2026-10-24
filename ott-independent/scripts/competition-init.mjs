import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, chownSync } from 'node:fs';
mkdirSync('.secrets', { recursive: true, mode: 0o700 });
if (!existsSync('.secrets/judge-token')) writeFileSync('.secrets/judge-token', randomBytes(48).toString('base64url'), { mode: 0o600 });
if (process.platform === 'linux' && process.getuid?.() === 0) chownSync('.secrets/judge-token', 1000, 1000);
console.log('Worker secret is ready in .secrets/judge-token. Never commit or share this file.');
