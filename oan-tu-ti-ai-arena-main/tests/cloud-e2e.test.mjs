import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { database } from '../lib/postgres.mjs';
import { CloudClient } from './cloud-client.mjs';
const base = process.env.ARENA_CLOUD_TEST_ORIGIN;
if (process.env.ARENA_ALLOW_CLOUD_SMOKE !== '1' || base !== 'https://oan-tu-ti-ai-arena.vercel.app') throw new Error('Explicit cloud smoke-test opt-in and the exact project URL are required. This creates labeled demo records.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nonce = randomBytes(5).toString('hex'), admin = new CloudClient(base), guest = new CloudClient(base);
const email = `arena-test-btc-${nonce}@vnu.edu.vn`, password = randomBytes(24).toString('base64url');
await admin.register(email, 'BTC DEMO Vercel', password);
await database().prepare('UPDATE auth_users SET is_admin=1 WHERE email=?').bind(email).run();
mkdirSync('.secrets', { recursive: true });
writeFileSync('.secrets/vercel-demo-admin.json', JSON.stringify({ email, password, origin: base }), { mode: 0o600 });
const config = { groupCount: 2, qualifiers: 1, deadline: new Date(Date.now()+86400000).toISOString(), seed: 2026, maxPlies: 20, moveMs: 2000, startupMs: 8000, memoryMB: 128, extraSets: 0 };
const event = (await admin.post({ action: 'create', name: 'DEMO Vercel + Docker — kiểm thử 4 đội', config })).id;
mkdirSync('work',{recursive:true});
writeFileSync('work/cloud-e2e-active.json',JSON.stringify({event,email}));
await guest.post({ action: 'team', event, name: 'Spoofed', seed: 9 }, 401);
await admin.post({ action: 'open', event });
const users = [];
for (let i=0;i<4;i++) {
  const user = new CloudClient(base), account = `arena-test-${nonce}-${i}@vnu.edu.vn`;
  await user.register(account, `Đội DEMO ${i+1}`, randomBytes(18).toString('base64url'));
  const team = (await admin.post({ action: 'team', event, name: `DEMO ${i+1}`, seed: i+1 })).id;
  const { token } = await admin.post({ action: 'invite', event, team, email: account, student: `CLOUD${nonce}${i}` });
  await guest.post({ action: 'join', token }, 401);
  await user.post({ action: 'join', token });
  await user.post({ action: 'create', name: 'Forbidden', config }, 403);
  await user.post({ action: 'submit', event, team: 'forged-team', source: readFileSync(`public/bots/${['sprinter','guardian','tactician'][i%3]}.py`,'utf8') });
  users.push(user);
}
await sleep(5100); // Intentionally respect the per-team submission quota.
await users[0].post({ action: 'submit', event, source: 'def choose_move(state):\n    return {"from":"A1","to":"I9"}\n' });
console.log('Submitted 4 valid bots and one invalid bot through production Vercel. Waiting for local Docker judge.');
let data;
for(let n=0;n<120;n++) {
  data = await admin.call(`/api/competition?event=${event}`);
  assert.equal(data.failed.length,0,'Worker infrastructure failure');
  if(data.jobs.find(j=>j.kind==='validate'&&j.status==='done')?.count===5) break;
  await sleep(3000);
}
assert.equal(data.jobs.find(j=>j.kind==='validate'&&j.status==='done')?.count,5);
const own = await users[0].call(`/api/competition?event=${event}`);
assert.ok(own.submissions.some(s=>s.status==='invalid'));
assert.ok(own.submissions.some(s=>s.status==='valid'));
await admin.post({ action:'config', event, config:{...config,deadline:new Date(admin.serverTime+2000).toISOString()} });
await sleep(3000);
assert.equal((await admin.post({action:'freeze',event})).entrants,4);
for(let n=0;n<180;n++) {
  data=await admin.call(`/api/competition?event=${event}`);
  assert.equal(data.failed.length,0,'Worker infrastructure failure');
  if(data.event.status==='review')break;
  await sleep(3000);
}
assert.equal(data.event.status,'review');
await admin.post({action:'publish',event});
const exported=await admin.call(`/api/competition?event=${event}&export=1`);
assert.equal(exported.games.length,6);assert.ok(exported.games.every(g=>g.result));
await users[0].call(`/api/competition?event=${event}&export=1`,null,403);
const replay=await guest.call(`/api/competition?game=${exported.games[0].id}`);
assert.ok(replay.result.moves.length>0);
mkdirSync('work',{recursive:true});
writeFileSync('work/cloud-e2e-result.json',JSON.stringify({event,url:`${base}/competition#${event}`,games:exported.games.length,valid:4,invalid:1,finishedAt:new Date().toISOString()},null,2));
console.log(`Cloud E2E passed: ${base}/competition#${event} — 4 teams, 5 validations, 6 games, replay and publication.`);
