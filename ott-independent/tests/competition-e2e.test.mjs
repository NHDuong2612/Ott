import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const base = process.env.OTT_DOCKER_URL || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('This test only creates demo accounts on a local instance.');
class Client {
  jar = new Map();
  async call(url, body, expected = 200) {
    const r = await fetch(base + url, { redirect: 'manual', ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}) } });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
    const text = await r.text(); assert.equal(r.status, expected, text.slice(0, 1000)); return r.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  }
  async register(email, name, password) {
    const html = await this.call('/register');
    const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
    const r = await fetch(base + '/register', { redirect: 'manual', method: 'POST', headers: { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, name, password, confirm: password, csrf, return_to: '/competition' }) });
    assert.equal(r.status, 303, await r.text());
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
  }
  post(body, expected = 200) { return this.call('/api/competition', body, expected); }
}
const nonce = randomBytes(4).toString('hex'), admin = new Client(), anonymous = new Client();
const email = `arena-demo-btc-${nonce}@vnu.edu.vn`, password = randomBytes(24).toString('base64url');
await admin.register(email, 'BTC giải demo', password);
const grant = spawnSync('docker', ['compose', 'exec', '-T', 'app', 'node', 'docker/admin.mjs', email], { encoding: 'utf8', timeout: 20000 });
assert.equal(grant.status, 0, grant.stderr);
mkdirSync('.secrets', { recursive: true });
writeFileSync('.secrets/local-demo-admin.json', JSON.stringify({ url: base + '/competition', email, password, purpose: 'Local QA organizer. Delete or revoke this account before public hosting.' }, null, 2), { mode: 0o600 });
const config = { groupCount: 4, qualifiers: 2, deadline: new Date(Date.now() + 86400000).toISOString(), seed: 2026, maxPlies: 40, moveMs: 2000, startupMs: 8000, memoryMB: 128, extraSets: 0 };
const event = (await admin.post({ action: 'create', name: 'GIẢI DEMO — 16 bot mẫu (kiểm thử)', config })).id;
await anonymous.post({ action: 'team', event, name: 'Spoofed', seed: 99 }, 401);
const workerDenied = await fetch(base + '/api/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(workerDenied.status, 401);
await admin.post({ action: 'open', event });
const started = Date.now();
for (let i = 0; i < 16; i++) {
  const user = new Client(), studentEmail = `arena-demo-${nonce}-${i}@vnu.edu.vn`;
  await user.register(studentEmail, `Sinh viên DEMO ${i + 1}`, randomBytes(18).toString('base64url'));
  const team = (await admin.post({ action: 'team', event, name: `DEMO ${String(i + 1).padStart(2, '0')}`, seed: i + 1 })).id;
  const token = (await admin.post({ action: 'invite', event, team, email: studentEmail, student: `DEMO${nonce}${i}` })).token;
  await user.post({ action: 'join', token });
  await user.post({ action: 'create', name: 'Not allowed', config }, 403);
  const botName = ['sprinter', 'guardian', 'tactician'][i % 3];
  await user.post({ action: 'submit', event, team: 'forged-other-team', source: readFileSync(`public/bots/${botName}.py`, 'utf8') });
}
let detail;
for (let attempt = 0; attempt < 300; attempt++) {
  detail = await admin.call(`/api/competition?event=${event}`);
  if (!detail.jobs.some(j => j.kind === 'validate' && ['queued', 'running'].includes(j.status))) break;
  assert.equal(detail.failed.length, 0, 'Worker infrastructure failed');
  await new Promise(r => setTimeout(r, 1000));
}
assert.equal(detail.jobs.find(j => j.kind === 'validate' && j.status === 'done')?.count, 16);
await admin.post({ action: 'config', event, config: { ...config, deadline: new Date(Date.now() - 1).toISOString() } });
const frozen = await admin.post({ action: 'freeze', event }); assert.equal(frozen.entrants, 16); assert.equal(frozen.games, 48);
for (let attempt = 0; attempt < 600; attempt++) {
  detail = await admin.call(`/api/competition?event=${event}`);
  if (detail.event.status === 'review') break;
  assert.equal(detail.failed.length, 0, 'Worker infrastructure failed');
  await new Promise(r => setTimeout(r, 1000));
}
assert.equal(detail.event.status, 'review', 'All games must finish');
assert.equal(detail.standings.reduce((n, r) => n + r.played, 0), 48);
await admin.post({ action: 'publish', event });
const exported = await admin.call(`/api/competition?event=${event}&export=1`);
assert.equal(exported.games.length, 62); assert.ok(exported.games.every(g => g.result));
assert.equal(exported.entries.length, 16); assert.equal(exported.event.status, 'published');
await anonymous.call(`/api/competition?event=${event}&export=1`, undefined, 403);
const game = await anonymous.call(`/api/competition?game=${exported.games[0].id}`); assert.ok(game.result.moves);
writeFileSync('work/competition-e2e-result.json', JSON.stringify({ event, url: `${base}/competition#${event}`, teams: 16, validations: 16, games: 62, elapsedMs: Date.now() - started, gameReasons: exported.games.reduce((map, g) => { map[g.result.reason] = (map[g.result.reason] || 0) + 1; return map; }, {}) }, null, 2));
console.log(`Docker E2E passed: 16 enrolled teams, Python validation, 48 group games + 14 knockout games, publication, replay and protected export. ${Math.round((Date.now() - started) / 1000)} seconds. ${base}/competition#${event}`);
