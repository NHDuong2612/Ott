import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openCompetition, action, leaseJob, finishJob, RUNTIME_VERSION, sha } from '../competition/store.mjs';
import { operations } from '../competition/operations.mjs';
import { ENGINE_VERSION } from '../lib/engine.mjs';

mkdirSync('work', { recursive: true });
const directory = mkdtempSync(path.resolve('work/operations-test-'));
let db = openCompetition(directory);
const admin = { id: 'btc', name: 'BTC', is_admin: 1 }, now = Date.now();
const config = { groupCount: 2, qualifiers: 1, deadline: new Date(now - 1000).toISOString(), seed: 42, maxPlies: 20, moveMs: 500, startupMs: 3000, memoryMB: 128, extraSets: 1 };
try {
  await assert.rejects(() => operations(db, null), e => e.status === 403);
  await assert.rejects(() => operations(db, { id: 'student', is_admin: 0 }), e => e.status === 403);
  const event = (await action(db, admin, { action: 'create', name: 'Dashboard test', config })).id;
  const other = (await action(db, admin, { action: 'create', name: 'Other event', config })).id;
  const teams = [];
  for (let i = 0; i < 6; i++) teams.push((await action(db, admin, { action: 'team', event, name: `Team ${i}`, seed: i + 1 })).id);
  db.prepare("UPDATE events SET status='open' WHERE id=?").run(event);
  db.prepare('INSERT INTO members(event,user,team,student) VALUES(?,?,?,?)').run(event, 'student', teams[0], 'SV01');
  function submission(id, team, status, created) {
    db.prepare('INSERT INTO submissions(id,team,source,sha,status,verdict,created) VALUES(?,?,?,?,?,?,?)').run(id, team, 'private source', id, status, 'verdict', created);
  }
  for (let i = 0; i < 4; i++) submission(`valid-${i}`, teams[i], 'valid', now - 5000);
  submission('latest-invalid', teams[0], 'invalid', now - 2000);
  submission('old-pending', teams[1], 'pending', now - 6000);
  submission('deadline-boundary', teams[4], 'valid', now - 1000);
  db.prepare('INSERT INTO workers(id,seen,runtime) VALUES(?,?,?)').run('judge', now, RUNTIME_VERSION);
  db.prepare('INSERT INTO workers(id,seen,runtime) VALUES(?,?,?)').run('wrong', now, 'old');
  db.prepare('INSERT INTO workers(id,seen,runtime) VALUES(?,?,?)').run('offline', now - 100000, RUNTIME_VERSION);
  function job(id, eventId, status, finished = null, started = null) {
    db.prepare('INSERT INTO jobs(id,event,kind,subject,status,payload,created,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, eventId, 'validate', id, status, '{}', now - 120000, started, finished);
  }
  for (let i = 0; i < 5; i++) job(`done-${i}`, event, 'done', now - 120000 + i * 30000, now - 125000 + i * 30000);
  job('historical', event, 'done');
  job('outside-window', event, 'done', now - 1000000, now - 1005000);
  job('pending-job', event, 'queued');
  job('other-failure', other, 'failed');
  let result = await operations(db, admin, event, now), data = result.operations;
  assert.deepEqual(data.summary, { rosterTeams: 6, activatedTeams: 1, submittedTeams: 5, noSubmissionTeams: 1, latestValidTeams: 4, latestInvalidTeams: 1, pendingTeams: 0, eligibleTeams: 4, submissions: 7, pendingSubmissions: 1, members: 1 });
  assert.equal(data.preflight.canFreeze, false, 'Old pending versions still block freezing');
  assert.equal(data.preflight.expectedGroupGames, 4);
  assert.deepEqual(data.workerSummary, { known: 3, online: 2, compatible: 1 });
  assert.equal(data.queues[0].completedRecent, 5, 'Historical and out-of-window jobs do not inflate throughput');
  assert.equal(data.queues[0].meanSeconds, 5);
  assert.equal(data.queues[0].etaSeconds, 180);
  assert.equal(data.queues[0].oldestCreated, now - 120000);
  assert.equal(data.issues.infrastructure.length, 0, 'Issues stay within selected event');
  assert.equal(data.issues.invalid.length, 1);
  assert.equal('source' in data.issues.invalid[0], false);
  assert.equal('standings' in result, false);
  db.prepare("UPDATE jobs SET finished_at=? WHERE id LIKE 'done-%'").run(now - 120000);
  assert.equal((await operations(db, admin, event, now)).operations.queues[0].etaSeconds, null, 'A burst of simultaneous completions is insufficient for ETA');
  for (let i = 0; i < 5; i++) db.prepare('UPDATE jobs SET finished_at=? WHERE id=?').run(now - 120000 + i * 30000, `done-${i}`);
  db.prepare("UPDATE submissions SET status='invalid' WHERE id='old-pending'").run();
  assert.equal((await operations(db, admin, event, now)).operations.preflight.canFreeze, true);
  db.prepare('UPDATE events SET paused=1 WHERE id=?').run(event);
  assert.equal((await operations(db, admin, event, now)).operations.queues[0].etaSeconds, null);
  db.prepare('UPDATE events SET paused=0 WHERE id=?').run(event);
  job('failed-job', event, 'failed'); job('expired-job', event, 'running');
  data = (await operations(db, admin, event, now)).operations;
  assert.equal(data.issues.infrastructure.length, 2);
  assert.equal(data.queues[0].expired, 1);
  assert.equal(data.queues[0].etaSeconds, null);
  db.prepare("INSERT INTO series(id,event,stage,round,a,b) VALUES('series',?,'groups',1,?,?)").run(event, teams[0], teams[1]);
  db.prepare("INSERT INTO games(id,series,ordinal,p1,p2,completed,reason,result) VALUES('game','series',1,?,?,1,'timeout',?)")
    .run(teams[0], teams[1], JSON.stringify({ reason: 'timeout', winner: 'P2' }));
  data = (await operations(db, admin, event, now)).operations;
  assert.equal(data.issues.botGameCount, 1);
  assert.equal(data.issues.botGames[0].reason, 'timeout');
  assert.equal(data.issues.infrastructure.length, 2, 'Bot faults do not become infrastructure retries');
  // Exercise real lease/completion telemetry and duplicate delivery handling.
  db.prepare("DELETE FROM jobs WHERE status IN ('running','queued')").run();
  const source = 'def choose_move(state): return state["legal_moves"][0]';
  db.prepare("UPDATE submissions SET source=?,sha=? WHERE id='valid-0'").run(source, sha(source));
  const payload = { submission: 'valid-0', sha: sha(source), engine: ENGINE_VERSION, runtime: RUNTIME_VERSION };
  db.prepare("INSERT INTO jobs(id,event,kind,subject,payload,created) VALUES('real-job',?,'validate','valid-0',?,?)").run(event, JSON.stringify(payload), now);
  const leased = await leaseJob(db, 'judge', RUNTIME_VERSION);
  assert.equal(leased.id, 'real-job');
  assert.ok(db.prepare("SELECT started_at FROM jobs WHERE id='real-job'").get().started_at);
  const verdict = { valid: true, message: 'passed', sha: payload.sha, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION };
  await finishJob(db, 'judge', leased.id, leased.lease, verdict);
  const finished = db.prepare("SELECT finished_at FROM jobs WHERE id='real-job'").get().finished_at;
  assert.ok(finished);
  assert.equal((await finishJob(db, 'judge', leased.id, leased.lease, verdict)).duplicate, true);
  assert.equal(db.prepare("SELECT finished_at FROM jobs WHERE id='real-job'").get().finished_at, finished);
  // Reopening is idempotent, and existing replay data can backfill reason.
  db.prepare("UPDATE games SET reason=NULL WHERE id='game'").run();
  db.close(); db = openCompetition(directory);
  assert.equal(db.prepare("SELECT reason FROM games WHERE id='game'").get().reason, 'timeout');
  assert.equal(db.prepare("SELECT finished_at FROM jobs WHERE id='historical'").get().finished_at, null);
  console.log('Operations passed: authorization, event isolation, latest versus eligible submissions, deadline boundary, preflight, worker state, measured throughput, ETA suppression, separate fault categories and idempotent telemetry.');
} finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
