import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { database } from '../lib/postgres.mjs';
import { withCompetition } from '../competition/postgres.mjs';
import { operations } from '../competition/operations.mjs';
import { action, overview, leaseJob, heartbeat, finishJob, exportEvent, sha, RUNTIME_VERSION } from '../competition/store.mjs';
import { createInitialBoard, referenceMove, applyMove, ENGINE_VERSION } from '../lib/engine.mjs';

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_FILE) throw new Error('Run with an explicit database environment file.');
const schema = `test_comp_${randomBytes(8).toString('hex')}`, sql = database();
const statements = (await readFile(new URL('../deploy/competition-schema.sql', import.meta.url), 'utf8')).replaceAll('arena_competition', schema).split(';').map(s => s.trim()).filter(Boolean);
await sql.transaction(statements);
const write = fn => withCompetition(fn, { schema, write: true }), read = fn => withCompetition(fn, { schema });
const admin = { id: 'test-admin', email: 'test-admin@example.test', is_admin: 1 };
const users = [0, 1].map(i => ({ id: `test-user-${i}`, email: `test-${i}@example.test` }));
const config = { groupCount: 1, qualifiers: 2, deadline: new Date(Date.now() + 86400000).toISOString(), seed: 42, maxPlies: 20, moveMs: 500, startupMs: 3000, memoryMB: 128, extraSets: 0 };
const act = (user, body) => write(db => action(db, user, body));
try {
  await assert.rejects(() => act(users[0], { action: 'create', name: 'Forbidden', config }), { status: 403 });
  const event = (await act(admin, { action: 'create', name: 'Postgres integration test', config })).id;
  for (const [i, user] of users.entries()) {
    const team = (await act(admin, { action: 'team', event, name: `Team ${i}`, seed: i + 1 })).id;
    const { token } = await act(admin, { action: 'invite', event, team, email: user.email, student: `TEST${i}` });
    await assert.rejects(() => act(users[1 - i], { action: 'join', token }), { status: 403 });
    await act(user, { action: 'join', token });
  }
  await act(admin, { action: 'open', event });
  await act(users[0], { action: 'submit', event, team: 'forged', source: 'def choose_move(s): return s["legal_moves"][0]' });
  const leases = await Promise.all([0, 1, 2, 3].map(i => write(db => leaseJob(db, `worker-${i}`, RUNTIME_VERSION))));
  assert.equal(leases.filter(Boolean).length, 1, 'Only one concurrent worker receives the submission');
  const index = leases.findIndex(Boolean), first = leases[index], worker = `worker-${index}`;
  await assert.rejects(() => write(db => heartbeat(db, 'wrong-worker', first.id, first.lease)), { status: 409 });
  const verdict = { valid: true, message: 'OK', sha: first.payload.sha, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION };
  const finishes = await Promise.all([0, 1].map(() => write(db => finishJob(db, worker, first.id, first.lease, verdict))));
  assert.equal(finishes.filter(r => r.duplicate).length, 1, 'Concurrent duplicate result commits exactly once');
  await act(users[1], { action: 'submit', event, source: 'def choose_move(s): return s["legal_moves"][0]' });
  const second = await write(db => leaseJob(db, 'worker-main', RUNTIME_VERSION));
  await write(db => finishJob(db, 'worker-main', second.id, second.lease, { ...verdict, sha: second.payload.sha }));
  await act(admin, { action: 'config', event, config: { ...config, deadline: new Date(Date.now() - 1).toISOString() } });
  await assert.rejects(() => read(db => operations(db, users[0], event)), { status: 403 });
  const dashboard = (await read(db => operations(db, admin, event))).operations;
  assert.equal(dashboard.summary.rosterTeams, 2);
  assert.equal(dashboard.summary.eligibleTeams, 2);
  assert.equal(dashboard.summary.pendingSubmissions, 0);
  assert.equal(dashboard.preflight.canFreeze, true);
  assert.equal(dashboard.queues[0].completedRecent, 2);
  assert.equal(typeof dashboard.queues[0].meanSeconds, 'number');
  assert.equal(dashboard.queues[0].etaSeconds, null);
  assert.ok(dashboard.workerSummary.compatible > 0);
  assert.equal((await act(admin, { action: 'freeze', event })).entrants, 2);
  let played = 0, job;
  while ((job = await write(db => leaseJob(db, 'worker-main', RUNTIME_VERSION)))) {
    const p = job.payload, board = createInitialBoard(), moves = []; let winner = null, reason = 'max_plies';
    for (let turn = 0; turn < p.config.maxPlies; turn++) {
      const player = turn % 2 ? 'P2' : 'P1', move = referenceMove(board, player, 'greedy', turn + 42);
      if (!move) { winner = player === 'P1' ? 'P2' : 'P1'; reason = 'no_moves'; break; }
      const step = applyMove(board, move, player); moves.push(step);
      if (step.winner) { winner = step.winner; reason = 'goal'; break; }
    }
    await write(db => finishJob(db, 'worker-main', job.id, job.lease, { moves, winner, reason, seed: p.seed, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, p1sha: p.p1.sha, p2sha: p.p2.sha }));
    assert.ok(++played <= 4);
  }
  assert.equal((await read(db => overview(db, admin, event))).event.status, 'review');
  await act(admin, { action: 'publish', event });
  const exported = await read(db => exportEvent(db, admin, event));
  assert.equal(exported.event.status, 'published'); assert.equal(exported.games.length, 4);
  assert.equal(exported.standings.length, 2);
  assert.equal((await read(db => overview(db, users[0], event))).submissions.length, 1);
  await assert.rejects(() => write(db => db.batch(async () => {
    await db.prepare('INSERT INTO workers(id,seen,runtime) VALUES(?,?,?)').run('rollback-test', 1, RUNTIME_VERSION);
    await db.prepare('INSERT INTO workers(id,seen,runtime) VALUES(?,?,?)').run('rollback-test', 2, RUNTIME_VERSION);
  })), { code: '23505' });
  assert.equal(await read(db => db.prepare('SELECT id FROM workers WHERE id=?').get('rollback-test')), undefined);
  const batchConfig = { ...config, groupCount: 4, qualifiers: 1 };
  const batchEvent = (await act(admin, { action: 'create', name: 'Batch schedule benchmark', config: batchConfig })).id;
  await act(admin, { action: 'open', event: batchEvent });
  const source = 'def choose_move(s): return s["legal_moves"][0]';
  // Synthetic prevalidated fixtures only inside this disposable test schema.
  await write(db => db.batch(async () => {
    for (let i=0;i<128;i++) {
      await db.prepare('INSERT INTO teams(id,event,name,seed,repo) VALUES(?,?,?,?,?)').run(`batch-team-${i}`,batchEvent,`Batch ${i}`,i+1,null);
      await db.prepare('INSERT INTO submissions(id,team,source,sha,status,created) VALUES(?,?,?,?,?,?)').run(`batch-bot-${i}`,`batch-team-${i}`,source,sha(source),'valid',Date.now()-120000);
    }
  }));
  await act(admin, { action:'config', event:batchEvent, config:{...batchConfig,deadline:new Date(Date.now()-60000).toISOString()} });
  const started = Date.now(), frozen = await act(admin, { action:'freeze', event:batchEvent });
  assert.equal(frozen.entrants,128); assert.equal(frozen.games,3968);
  assert.equal((await read(db => db.prepare('SELECT COUNT(*) n FROM games g JOIN series s ON s.id=g.series WHERE s.event=?').get(batchEvent))).n,3968);
  console.log(`Batch freeze: 128 synthetic entrants, 3968 scheduled games in ${Date.now()-started}ms; constraint failure rolls back all batched writes.`);
  console.log('Postgres passed: isolated schema, identity, concurrent leases, duplicate finish, numeric types, groups, knockout, publication and rollback.');
} finally {
  if (!/^test_comp_[a-f0-9]{16}$/.test(schema)) throw new Error('Unsafe test schema cleanup');
  await sql.query(`DROP SCHEMA ${schema} CASCADE`);
}
