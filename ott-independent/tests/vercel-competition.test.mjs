import assert from 'node:assert/strict';
import { competitionRequest } from '../competition/vercel.mjs';
const origin = 'https://arena-test.example';
delete process.env.ARENA_DEPLOYMENT; delete process.env.PUBLIC_ORIGIN; delete process.env.JUDGE_TOKEN;
const request = (headers = {}, body = '{}') => new Request(origin + '/api/competition', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body });
for (const headers of [{}, { 'x-arena-bootstrap': '1', 'oai-authenticated-user-id': 'admin' }]) {
  assert.equal((await competitionRequest(new Request(origin + '/api/competition?dashboard=1', { headers }))).status, 403);
}
assert.equal((await competitionRequest(request(), true)).status, 401);
assert.equal((await competitionRequest(request({ Origin: 'https://attacker.example' }))).status, 403);
assert.equal((await competitionRequest(request({ 'sec-fetch-site': 'cross-site' }))).status, 403);
assert.equal((await competitionRequest(request({ 'x-arena-bootstrap': '1', 'oai-authenticated-user-id': 'admin' }))).status, 401);
process.env.JUDGE_TOKEN = 'test-secret-that-is-long-enough-for-worker-authentication';
assert.equal((await competitionRequest(request({ Authorization: 'Bearer wrong' }), true)).status, 401);
assert.equal((await competitionRequest(request({ Authorization: `Bearer ${process.env.JUDGE_TOKEN}` }, 'invalid'), true)).status, 400);
assert.equal((await competitionRequest(request({ Authorization: `Bearer ${process.env.JUDGE_TOKEN}` }, JSON.stringify({ worker: 'test', padding: 'x'.repeat(262144) })), true)).status, 413);
console.log('Vercel API passed: worker secret, CSRF origin, spoofed identity, invalid JSON and bounded request bodies.');
