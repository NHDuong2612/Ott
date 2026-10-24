import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openCompetition, action, overview, leaseJob, heartbeat, finishJob, failJob, RUNTIME_VERSION, sha, exportEvent } from '../competition/store.mjs';
import { createInitialBoard, applyMove, legalMoves, referenceMove, ENGINE_VERSION } from '../lib/engine.mjs';

mkdirSync('work', { recursive: true });
const directory = mkdtempSync(path.resolve('work/competition-test-')), db = openCompetition(directory);
const admin = { id: 'admin', email: 'btc@example.test', is_admin: 1 }, users = Array.from({ length: 4 }, (_, i) => ({ id: `student-${i}`, email: `student-${i}@example.test`, is_admin: 0 }));
const config = { groupCount: 2, qualifiers: 1, deadline: new Date(Date.now() + 86400000).toISOString(), seed: 42, maxPlies: 20, moveMs: 500, startupMs: 3000, memoryMB: 128, extraSets: 1 };
const rejects = (fn, status) => assert.rejects(fn, error => !status || error.status === status);
const source = 'def choose_move(state):\n    return state["legal_moves"][0]\n';
function validation(job) { return { valid: true, message: 'passed', sha: job.payload.sha, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION }; }
function result(job) {
  const p = job.payload, board = createInitialBoard(), moves = []; let winner = null, reason = 'max_plies';
  for (let i = 0; i < p.config.maxPlies; i++) {
    const player = i % 2 ? 'P2' : 'P1', move = referenceMove(board, player, 'greedy', i + 42);
    if (!move) { winner = player === 'P1' ? 'P2' : 'P1'; reason = 'no_moves'; break; }
    const step = applyMove(board, move, player); moves.push(step);
    if (step.winner) { winner = step.winner; reason = 'goal'; break; }
  }
  return { moves, winner, reason, seed: p.seed, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, p1sha: p.p1.sha, p2sha: p.p2.sha };
}
try {
  (await rejects(async () => (await action(db, users[0], { action: 'create', name: 'Unauthorized', config })), 403));
  (await rejects(async () => (await action(db, admin, { action: 'create', name: 'Invalid groups', config: { ...config, groupCount: 3 } }))));
  const event = (await action(db, admin, { action: 'create', name: 'Integration tournament', config })).id;
  const mismatch = (await action(db, admin, { action: 'create', name: 'Pinned old runtime', config })).id;
  (await action(db, admin, { action: 'open', event: mismatch }));
  (await db.prepare("INSERT INTO jobs(id,event,kind,subject,payload,created) VALUES('old-version',?,'validate','old-source',?,0)").run(mismatch, JSON.stringify({ engine: ENGINE_VERSION, runtime: 'old-runtime' })));
  assert.equal((await leaseJob(db, 'judge-a', RUNTIME_VERSION)), null);
  assert.equal((await overview(db, admin, mismatch)).event.paused, 1, 'An incompatible deployment pauses the old event instead of changing its rules');
  assert.equal((await overview(db, admin, mismatch)).failed.length, 1);
  const teamIds = [];
  for (let i = 0; i < 4; i++) {
    const team = (await action(db, admin, { action: 'team', event, name: `Team ${i}`, seed: i + 1 })).id; teamIds.push(team);
    const token = (await action(db, admin, { action: 'invite', event, team, email: users[i].email, student: `2400${i}` })).token;
    (await rejects(async () => (await action(db, users[(i + 1) % 4], { action: 'join', token })), 403));
    (await action(db, users[i], { action: 'join', token }));
    (await rejects(async () => (await action(db, users[i], { action: 'join', token })), 403));
  }
  (await action(db, admin, { action: 'open', event }));
  const submission = (await action(db, users[0], { action: 'submit', event, team: teamIds[1], source }));
  assert.equal((await db.prepare('SELECT team FROM submissions WHERE id=?').get(submission.id)).team, teamIds[0], 'Owner is derived from session, never submitted team ID');
  assert.equal((await action(db, users[0], { action: 'submit', event, source })).duplicate, true);
  (await rejects(async () => (await action(db, users[0], { action: 'submit', event, source: source + '#new' })), 429));
  for (let i = 1; i < 4; i++) (await action(db, users[i], { action: 'submit', event, source }));
  const stranger = { id: 'stranger', email: users[0].email };
  (await rejects(async () => (await action(db, stranger, { action: 'submit', event, source })), 403));
  (await rejects(async () => (await leaseJob(db, 'bad-runtime', 'unapproved-runtime')), 409));
  let job = (await leaseJob(db, 'judge-a', RUNTIME_VERSION));
  (await rejects(async () => (await finishJob(db, 'judge-b', job.id, job.lease, validation(job))), 409));
  const old = job;
  job = (await leaseJob(db, 'judge-b', RUNTIME_VERSION, Date.now() + 91000));
  (await rejects(async () => (await finishJob(db, 'judge-a', old.id, old.lease, validation(old))), 409));
  (await heartbeat(db, 'judge-b', job.id, job.lease));
  const verdict = validation(job);
  (await rejects(async () => (await finishJob(db, 'judge-b', job.id, job.lease, { ...verdict, sha: 'fake' }))));
  (await finishJob(db, 'judge-b', job.id, job.lease, verdict));
  assert.equal((await finishJob(db, 'judge-b', job.id, job.lease, verdict)).duplicate, true);
  (await action(db, admin, { action: 'config', event, config: { ...config, deadline: new Date(Date.now() - 1).toISOString() } }));
  (await rejects(async () => (await action(db, users[0], { action: 'submit', event, source: source + '#late' }))));
  assert.equal((await action(db, admin, { action: 'freeze', event })).waiting, true);
  while ((job = (await leaseJob(db, 'judge-a', RUNTIME_VERSION)))) (await finishJob(db, 'judge-a', job.id, job.lease, validation(job)));
  assert.equal((await action(db, admin, { action: 'freeze', event })).entrants, 4);
  (await rejects(async () => (await action(db, admin, { action: 'config', event, config }))));
  (await rejects(async () => (await action(db, admin, { action: 'team', event, name: 'Late team', seed: 99 }))));
  (await action(db, admin, { action: 'pause', event }));
  assert.equal((await leaseJob(db, 'judge-a', RUNTIME_VERSION)), null);
  (await action(db, admin, { action: 'pause', event }));
  job = (await leaseJob(db, 'judge-a', RUNTIME_VERSION));
  (await failJob(db, 'judge-a', job.id, job.lease));
  (await db.prepare('UPDATE jobs SET next=0 WHERE id=?').run(job.id));
  let played = 0;
  while ((job = (await leaseJob(db, 'judge-a', RUNTIME_VERSION)))) {
    assert.equal(job.kind, 'game'); const r = result(job);
    (await rejects(async () => (await finishJob(db, 'judge-a', job.id, job.lease, { ...r, p1sha: 'forged' }))));
    (await rejects(async () => (await finishJob(db, 'judge-a', job.id, job.lease, { ...r, moves: [{ from: 'A1', to: 'I9' }], winner: 'P1' }))));
    (await finishJob(db, 'judge-a', job.id, job.lease, r));
    const before = (await db.prepare('SELECT COUNT(*) n FROM audit').get()).n;
    assert.equal((await finishJob(db, 'judge-a', job.id, job.lease, r)).duplicate, true);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM audit').get()).n, before);
    assert.ok(++played < 30, 'Extra sets must be finite');
  }
  assert.equal((await overview(db, admin, event)).event.status, 'review');
  const rows = (await overview(db, admin, event)).standings;
  assert.equal(rows.reduce((n, r) => n + r.played, 0), 4, 'Every group series counted exactly once');
  assert.equal((await overview(db, null, event)).members.length, 0);
  assert.equal((await overview(db, users[0], event)).submissions.length, 1);
  (await rejects(async () => (await exportEvent(db, users[0], event)), 403));
  (await action(db, admin, { action: 'publish', event }));
  const exported = (await exportEvent(db, admin, event));
  assert.equal(exported.event.status, 'published'); assert.equal(exported.entries.length, 4);
  const snapshot = exported.event.snapshot;
  assert.equal(JSON.parse(snapshot).engine, ENGINE_VERSION);
  assert.equal(exported.submissions.every(v => sha(v.source) === v.sha), true);
  const file = path.join(directory, 'competition.sqlite'); db.close();
  const reopened = openCompetition(directory);
  assert.equal((await overview(reopened, null, event)).event.status, 'published'); reopened.close();
  console.log(`Competition passed: identity, invitations, quotas, deadline, immutable entries, runtime checks, lease fencing, heartbeat, safe retry, replay validation, duplicate results, balanced groups, complete knockout (${played} games), publication, export and restart persistence.`);
} finally {
  try { db.close(); } catch {}
  if (!directory.startsWith(path.resolve('work') + path.sep)) throw new Error('Unsafe cleanup path');
  rmSync(directory, { recursive: true, force: true });
}
