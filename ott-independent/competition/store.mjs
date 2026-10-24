import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { createInitialBoard, applyMove, legalMoves, ENGINE_VERSION } from '../lib/engine.mjs';

export const RUNTIME_VERSION = 'cpython-3.15.0-wasmtime-50.0.1-v1';
export const sha = value => createHash('sha256').update(value).digest('hex');
const id = () => randomUUID();
const encode = JSON.stringify;
const decode = row => row ? { ...row, config: row.config ? JSON.parse(row.config) : undefined } : null;
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export const configSchema = z.object({
  groupCount: z.number().int().min(1).max(128).default(4),
  qualifiers: z.number().int().min(1).max(4).default(2),
  deadline: z.string().datetime(),
  seed: z.number().int().min(1).max(2147483647).default(2026),
  maxPlies: z.number().int().min(20).max(200).default(200),
  moveMs: z.number().int().min(100).max(5000).default(2000),
  startupMs: z.number().int().min(1000).max(15000).default(8000),
  memoryMB: z.number().int().min(64).max(256).default(128),
  extraSets: z.number().int().min(0).max(2).default(1),
}).strict().superRefine((c, ctx) => {
  const n = c.groupCount * c.qualifiers;
  if (n < 2 || (n & (n - 1))) ctx.addIssue({ code: 'custom', message: 'Số bảng × suất đi tiếp phải là lũy thừa của 2 (tối thiểu 2).' });
});

export function openCompetition(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'competition.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL,config TEXT NOT NULL,paused INTEGER NOT NULL DEFAULT 0,snapshot TEXT,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES events(id),name TEXT NOT NULL,seed INTEGER NOT NULL,repo TEXT,UNIQUE(event,name),UNIQUE(event,seed));
    CREATE TABLE IF NOT EXISTS members(event TEXT NOT NULL REFERENCES events(id),user TEXT NOT NULL,team TEXT NOT NULL REFERENCES teams(id),student TEXT NOT NULL,PRIMARY KEY(event,user));
    CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES events(id),team TEXT NOT NULL REFERENCES teams(id),email TEXT NOT NULL,student TEXT NOT NULL,expires INTEGER NOT NULL,redeemed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,team TEXT NOT NULL REFERENCES teams(id),source TEXT NOT NULL,sha TEXT NOT NULL,status TEXT NOT NULL,verdict TEXT,provenance TEXT,created INTEGER NOT NULL,UNIQUE(team,sha));
    CREATE TABLE IF NOT EXISTS entries(event TEXT NOT NULL REFERENCES events(id),team TEXT NOT NULL REFERENCES teams(id),submission TEXT NOT NULL REFERENCES submissions(id),group_no INTEGER NOT NULL,seed INTEGER NOT NULL,PRIMARY KEY(event,team));
    CREATE TABLE IF NOT EXISTS series(id TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES events(id),stage TEXT NOT NULL,round INTEGER NOT NULL,group_no INTEGER,a TEXT NOT NULL REFERENCES teams(id),b TEXT NOT NULL REFERENCES teams(id),winner TEXT,status TEXT NOT NULL DEFAULT 'queued',extra INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,series TEXT NOT NULL REFERENCES series(id),ordinal INTEGER NOT NULL,p1 TEXT NOT NULL REFERENCES teams(id),p2 TEXT NOT NULL REFERENCES teams(id),result TEXT,UNIQUE(series,ordinal));
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES events(id),kind TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',lease TEXT,until INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,worker TEXT,next INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL,result_hash TEXT,created INTEGER NOT NULL,UNIQUE(kind,subject));
    CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,next,kind,created);
    CREATE INDEX IF NOT EXISTS submissions_team ON submissions(team,created);
    CREATE INDEX IF NOT EXISTS series_event ON series(event,stage,round);
    CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY,seen INTEGER NOT NULL,runtime TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,event TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);`);
  if (!db.prepare('PRAGMA table_info(games)').all().some(c => c.name === 'completed')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('ALTER TABLE games ADD COLUMN completed INTEGER NOT NULL DEFAULT 0; ALTER TABLE games ADD COLUMN winner TEXT;');
      db.exec("UPDATE games SET completed=1,winner=json_extract(result,'$.winner') WHERE result IS NOT NULL;");
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  db.exec('CREATE INDEX IF NOT EXISTS games_scores ON games(series,completed,winner,p1,p2);');
  // Additive telemetry: old jobs have no trustworthy execution timestamps.
  const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map(c => c.name));
  for (const column of ['started_at', 'finished_at']) if (!jobColumns.has(column)) db.exec(`ALTER TABLE jobs ADD COLUMN ${column} INTEGER`);
  if (!db.prepare('PRAGMA table_info(games)').all().some(c => c.name === 'reason')) db.exec('ALTER TABLE games ADD COLUMN reason TEXT');
  db.exec("UPDATE games SET reason=json_extract(result,'$.reason') WHERE result IS NOT NULL AND reason IS NULL;");
  db.exec('CREATE INDEX IF NOT EXISTS jobs_event_finished ON jobs(event,kind,finished_at); CREATE INDEX IF NOT EXISTS jobs_event_status ON jobs(event,status,created); CREATE INDEX IF NOT EXISTS audit_event_created ON audit(event,created);');
  db.exec('CREATE INDEX IF NOT EXISTS members_event_team ON members(event,team);');
  return db;
}
const contexts = new AsyncLocalStorage(), waiting = new WeakMap();
export async function transaction(db, fn) {
  if (db.transaction) return db.transaction(fn);
  if (contexts.getStore() === db) return fn();
  const previous = waiting.get(db) || Promise.resolve();
  let release; const next = new Promise(resolve => { release = resolve; });
  waiting.set(db, next); await previous;
  try {
    db.exec('BEGIN IMMEDIATE');
    try { const result = await contexts.run(db, fn); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { release(); if (waiting.get(db) === next) waiting.delete(db); }
}
const log = async (db, actor, event, action, detail = {}) => (await db.prepare('INSERT INTO audit(actor,event,action,detail,created) VALUES(?,?,?,?,?)').run(actor, event, action, encode(detail), Date.now()));
const eventOf = async (db, event) => decode((await db.prepare('SELECT * FROM events WHERE id=?').get(event))) || fail('Không tìm thấy giải đấu.', 404);
const admin = user => { if (!user?.is_admin) fail('Chỉ ban tổ chức được thực hiện thao tác này.', 403); };
const teamOf = async (db, event, user) => (await db.prepare('SELECT t.* FROM members m JOIN teams t ON t.id=m.team WHERE m.event=? AND m.user=?').get(event, user.id)) || fail('Cần mã tham gia do ban tổ chức cấp.', 403);
const enqueue = async (db, event, kind, subject, payload) => (await db.prepare('INSERT INTO jobs(id,event,kind,subject,payload,created) VALUES(?,?,?,?,?,?)').run(id(), event, kind, subject, encode(payload), Date.now()));

export async function createEvent(db, user, input) {
  admin(user);
  const name = z.string().trim().min(3).max(100).parse(input.name), config = configSchema.parse(input.config);
  const event = id();
  (await transaction(db, async () => { (await db.prepare("INSERT INTO events(id,name,status,config,created) VALUES(?,?,'draft',?,?)").run(event, name, encode(config), Date.now())); (await log(db, user.id, event, 'create', config)); }));
  return { id: event };
}
export async function editConfig(db, user, event, input) {
  admin(user); const e = (await eventOf(db, event));
  if (!['draft', 'open'].includes(e.status)) fail('Cấu hình đã khóa. Hãy tạo giải mới.');
  const config = configSchema.parse(input);
  if (e.status === 'open' && Object.keys(config).some(key => key !== 'deadline' && config[key] !== e.config[key])) fail('Khi đã mở nhận bài, chỉ được sửa hạn nộp. Luật và giới hạn tài nguyên đã cố định.');
  (await transaction(db, async () => { (await db.prepare('UPDATE events SET config=? WHERE id=?').run(encode(config), event)); (await log(db, user.id, event, 'config', config)); }));
  return { ok: true };
}
export async function addTeam(db, user, event, input) {
  admin(user); const e = (await eventOf(db, event));
  if (!['draft', 'open'].includes(e.status)) fail('Danh sách đội đã khóa.');
  const data = z.object({ name: z.string().trim().min(2).max(80), seed: z.number().int().min(1).max(100000), repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional() }).parse(input);
  const team = id();
  (await transaction(db, async () => { (await db.prepare('INSERT INTO teams(id,event,name,seed,repo) VALUES(?,?,?,?,?)').run(team, event, data.name, data.seed, data.repo || null)); (await log(db, user.id, event, 'team', { team, ...data })); }));
  return { id: team };
}
export async function invite(db, user, event, input) {
  admin(user); const e = (await eventOf(db, event));
  if (!['draft', 'open'].includes(e.status)) fail('Danh sách đã khóa.');
  const team = (await db.prepare('SELECT * FROM teams WHERE id=? AND event=?').get(input.team, event));
  if (!team) fail('Đội không thuộc giải.');
  const email = z.string().email().max(254).parse(input.email).toLowerCase();
  const student = z.string().trim().min(2).max(60).parse(input.student);
  const token = randomBytes(24).toString('base64url');
  (await transaction(db, async () => {
    (await db.prepare('UPDATE invites SET redeemed=1 WHERE event=? AND student=?').run(event, student));
    (await db.prepare('INSERT INTO invites(hash,event,team,email,student,expires) VALUES(?,?,?,?,?,?)').run(sha(token), event, team.id, email, student, Date.now() + 7 * 86400000));
    (await log(db, user.id, event, 'invite', { team: team.id, student }));
  }));
  return { token, expiresInDays: 7 };
}
export async function join(db, user, token) {
  z.string().min(20).max(100).parse(token);
  return (await transaction(db, async () => {
    const row = (await db.prepare('SELECT * FROM invites WHERE hash=? AND redeemed=0 AND expires>?').get(sha(token), Date.now()));
    if (!row || row.email !== user.email.toLowerCase()) fail('Mã không hợp lệ, đã dùng hoặc không dành cho tài khoản này.', 403);
    const e = (await eventOf(db, row.event));
    if (!['draft', 'open'].includes(e.status)) fail('Danh sách đã khóa.');
    if ((await db.prepare('SELECT 1 FROM members WHERE event=? AND user=?').get(row.event, user.id))) fail('Tài khoản đã được gắn với một đội.');
    if ((await db.prepare('SELECT 1 FROM members WHERE event=? AND student=?').get(row.event, row.student))) fail('Sinh viên đã có trong danh sách.');
    (await db.prepare('INSERT INTO members(event,user,team,student) VALUES(?,?,?,?)').run(row.event, user.id, row.team, row.student));
    (await db.prepare('UPDATE invites SET redeemed=1 WHERE hash=?').run(row.hash));
    (await log(db, user.id, row.event, 'join', { team: row.team }));
    return { event: row.event };
  }));
}
async function saveSubmission(db, user, event, source, provenance = 'upload') {
  const e = (await eventOf(db, event)), team = (await teamOf(db, event, user));
  if (e.status !== 'open' || Date.now() >= Date.parse(e.config.deadline)) fail('Đã hết thời gian nộp bài.');
  if (typeof source !== 'string' || Buffer.byteLength(source) > 65536 || !source.trim() || source.includes('\0')) fail('Nộp một tệp Python UTF-8, tối đa 64 KiB.');
  const hash = sha(source);
  const stats = await db.prepare("SELECT COUNT(*) total,MAX(created) newest,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,MAX(CASE WHEN sha=? THEN id END) duplicate_id,MAX(CASE WHEN sha=? THEN status END) duplicate_status FROM submissions WHERE team=?").get(hash, hash, team.id);
  if (stats.duplicate_id) return { id: stats.duplicate_id, status: stats.duplicate_status, duplicate: true };
  if (stats.newest !== null && Date.now() - stats.newest < 5000) fail('Mỗi đội nộp tối đa một phiên bản mỗi 5 giây.', 429);
  if (stats.pending >= 2) fail('Đội đang có 2 bài chờ kiểm tra. Hãy đợi kết quả.', 429);
  if (stats.total >= 200) fail('Đội đã đạt giới hạn 200 phiên bản. Liên hệ ban tổ chức.');
  const submission = id();
  (await transaction(db, async () => {
    (await db.prepare("INSERT INTO submissions(id,team,source,sha,status,provenance,created) VALUES(?,?,?,?,'pending',?,?)").run(submission, team.id, source, hash, provenance, Date.now()));
    (await enqueue(db, event, 'validate', submission, { submission, sha: hash, config: e.config, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION }));
    (await log(db, user.id, event, 'submit', { submission, sha: hash, provenance }));
  }));
  return { id: submission, status: 'pending', sha: hash };
}

async function schedulePair(db, e, stage, round, group, a, b) {
  const series = id();
  (await db.prepare('INSERT INTO series(id,event,stage,round,group_no,a,b) VALUES(?,?,?,?,?,?,?)').run(series, e.id, stage, round, group, a.team, b.team));
  (await scheduleGames(db, e, { id: series, a: a.team, b: b.team }, 0));
}
async function scheduleGames(db, e, s, offset) {
  const entries = e.frozenEntries ? [e.frozenEntries.get(s.a), e.frozenEntries.get(s.b)] : (await db.prepare('SELECT x.team,x.seed,v.id submission,v.sha FROM entries x JOIN submissions v ON v.id=x.submission WHERE x.event=? AND x.team IN (?,?)').all(e.id, s.a, s.b));
  const a = entries.find(x => x.team === s.a), b = entries.find(x => x.team === s.b);
  for (let leg = 0; leg < 2; leg++) {
    const game = id(), p1 = leg ? b : a, p2 = leg ? a : b;
    (await db.prepare('INSERT INTO games(id,series,ordinal,p1,p2) VALUES(?,?,?,?,?)').run(game, s.id, offset + leg, p1.team, p2.team));
    (await enqueue(db, e.id, 'game', game, { game, p1, p2, config: e.config, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, seed: (e.config.seed + parseInt(sha(s.id + ':' + offset).slice(0, 7), 16)) % 2147483647 }));
  }
}
export async function freeze(db, user, event) {
  admin(user);
  return (await transaction(db, async () => {
    const e = (await eventOf(db, event));
    if (!['open', 'locking'].includes(e.status)) fail('Giải cần mở nhận bài trước khi khóa.');
    if (Date.now() < Date.parse(e.config.deadline)) fail('Chưa tới hạn chốt bài. Có thể sửa hạn trước khi khóa.');
    if ((await db.prepare("SELECT 1 FROM submissions v JOIN teams t ON t.id=v.team WHERE t.event=? AND v.status='pending'").get(event))) {
      (await db.prepare("UPDATE events SET status='locking' WHERE id=?").run(event));
      return { waiting: true, message: 'Đang đợi kiểm tra hết bài nộp trước hạn. Bấm khóa lại sau khi hàng đợi hoàn tất.' };
    }
    const teams = (await db.prepare('SELECT t.*,v.id submission,v.sha FROM teams t JOIN submissions v ON v.id=(SELECT id FROM submissions WHERE team=t.id AND status=\'valid\' AND created<? ORDER BY created DESC,id DESC LIMIT 1) WHERE t.event=? ORDER BY t.seed,t.id').all(Date.parse(e.config.deadline), event));
    if (teams.length < e.config.groupCount * Math.max(2, e.config.qualifiers) || teams.length > e.config.groupCount * 32) fail('Mỗi bảng cần 2–32 đội có bài hợp lệ, và đủ suất đi tiếp.');
    // Seeded shuffle followed by snake distribution. Frozen once, never edited in place.
    teams.sort((a, b) => sha(e.config.seed + ':' + a.id).localeCompare(sha(e.config.seed + ':' + b.id)));
    const groups = Array.from({ length: e.config.groupCount }, () => []);
    e.frozenEntries = new Map(teams.map(t => [t.id, { team: t.id, seed: t.seed, submission: t.submission, sha: t.sha }]));
    const schedule = async () => {
      for (const [i, t] of teams.entries()) {
        const block = Math.floor(i / groups.length), index = i % groups.length, group = block % 2 ? groups.length - 1 - index : index;
        const entry = { ...t, team: t.id };
        groups[group].push(entry);
        (await db.prepare('INSERT INTO entries(event,team,submission,group_no,seed) VALUES(?,?,?,?,?)').run(event, t.id, t.submission, group + 1, t.seed));
      }
      for (let g = 0; g < groups.length; g++) for (let a = 0; a < groups[g].length; a++) for (let b = a + 1; b < groups[g].length; b++) (await schedulePair(db, e, 'groups', 1, g + 1, groups[g][a], groups[g][b]));
    };
    if (db.batch) await db.batch(schedule); else await schedule();
    const snapshot = encode({ config: e.config, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, teams: teams.map(t => ({ team: t.id, submission: t.submission })), lockedAt: Date.now() });
    (await db.prepare("UPDATE events SET status='groups',snapshot=? WHERE id=?").run(snapshot, event));
    (await log(db, user.id, event, 'freeze', { snapshotHash: sha(snapshot), entrants: teams.length }));
    return { entrants: teams.length, games: groups.reduce((n, g) => n + g.length * (g.length - 1), 0) };
  }));
}

export async function standings(db, event) {
  const entries = (await db.prepare('SELECT x.*,t.name FROM entries x JOIN teams t ON t.id=x.team WHERE x.event=? ORDER BY x.group_no,x.seed').all(event));
  const series = (await db.prepare("SELECT * FROM series WHERE event=? AND stage='groups'").all(event));
  const games = (await db.prepare("SELECT g.p1,g.p2,g.winner FROM games g JOIN series s ON s.id=g.series WHERE s.event=? AND s.stage='groups' AND g.completed=1").all(event));
  const rows = entries.map(x => ({ ...x, points: 0, played: 0, won: 0, drawn: 0, lost: 0, gamePoints: 0, gameDiff: 0, headToHead: 0 }));
  const map = new Map(rows.map(r => [r.team, r]));
  for (const s of series.filter(s => s.status === 'done')) for (const team of [s.a, s.b]) {
    const r = map.get(team); if (!r) continue;
    r.played++; const win = s.winner === team, draw = !s.winner;
    r.points += win ? 3 : draw ? 1 : 0; r.won += +win; r.drawn += +draw; r.lost += +(!win && !draw);
  }
  for (const g of games) for (const team of [g.p1, g.p2]) {
    const r = map.get(team); if (!r) continue;
    const winner = g.winner === 'P1' ? g.p1 : g.winner === 'P2' ? g.p2 : null;
    r.gamePoints += !winner ? .5 : winner === team ? 1 : 0;
    r.gameDiff += !winner ? 0 : winner === team ? 1 : -1;
  }
  // A tied cohort is fixed before computing mini-league scores; comparator is transitive.
  for (const r of rows) for (const s of series.filter(s => s.status === 'done' && (s.a === r.team || s.b === r.team))) {
    const other = map.get(s.a === r.team ? s.b : s.a);
    if (other?.points === r.points) r.headToHead += s.winner === r.team ? 3 : !s.winner ? 1 : 0;
  }
  return rows.sort((a, b) => a.group_no - b.group_no || b.points - a.points || b.headToHead - a.headToHead || b.gameDiff - a.gameDiff || a.seed - b.seed);
}

async function advance(db, event) {
  const e = (await eventOf(db, event));
  if (!['groups', 'knockout'].includes(e.status)) return;
  const phase = e.status, all = (await db.prepare('SELECT * FROM series WHERE event=? AND stage=? ORDER BY rowid').all(event, phase));
  if (!all.length || all.some(s => s.status !== 'done')) return;
  if (phase === 'groups') {
    const rows = (await standings(db, event)), qualified = [];
    for (let rank = 0; rank < e.config.qualifiers; rank++) {
      const groups = Array.from({ length: e.config.groupCount }, (_, i) => i + 1);
      for (const group of groups) qualified.push(rows.filter(r => r.group_no === group)[rank]);
    }
    // Standard seed bracket, placing the strongest seed against the weakest.
    let order = [0, 1];
    while (order.length < qualified.length) order = order.flatMap(i => [i, order.length * 2 - 1 - i]);
    for (let i = 0; i < order.length; i += 2) (await schedulePair(db, e, 'knockout', 1, null, qualified[order[i]], qualified[order[i + 1]]));
    (await db.prepare("UPDATE events SET status='knockout' WHERE id=?").run(event));
    (await log(db, 'scheduler', event, 'qualify', qualified.map(r => r.team)));
  } else {
    const round = Math.max(...all.map(s => s.round)), current = all.filter(s => s.round === round);
    if (current.length === 1) { (await db.prepare("UPDATE events SET status='review' WHERE id=?").run(event)); (await log(db, 'scheduler', event, 'ready-to-publish', { champion: current[0].winner })); }
    else for (let i = 0; i < current.length; i += 2) (await schedulePair(db, e, 'knockout', round + 1, null, { team: current[i].winner }, { team: current[i + 1].winner }));
  }
}
async function settleSeries(db, series) {
  const s = (await db.prepare('SELECT * FROM series WHERE id=?').get(series)), e = (await eventOf(db, s.event));
  const games = (await db.prepare('SELECT * FROM games WHERE series=? ORDER BY ordinal').all(series));
  if (games.some(g => !g.result)) return;
  let a = 0, b = 0;
  for (const g of games) {
    const r = JSON.parse(g.result);
    if (!r.winner) { a += .5; b += .5; }
    else if ((r.winner === 'P1' ? g.p1 : g.p2) === s.a) a++; else b++;
  }
  if (a === b && s.stage === 'knockout' && s.extra < e.config.extraSets) {
    (await scheduleGames(db, e, s, games.length)); (await db.prepare('UPDATE series SET extra=extra+1 WHERE id=?').run(series)); return;
  }
  let winner = a > b ? s.a : b > a ? s.b : null;
  if (!winner && s.stage === 'knockout') winner = (await db.prepare('SELECT team FROM entries WHERE event=? AND team IN (?,?) ORDER BY seed,team LIMIT 1').get(s.event, s.a, s.b)).team;
  (await db.prepare("UPDATE series SET winner=?,status='done' WHERE id=?").run(winner, series));
  (await advance(db, s.event));
}

export async function leaseJob(db, worker, runtime, now = Date.now(), queue = 'all') {
  if (runtime !== RUNTIME_VERSION) fail('Runtime worker không khớp phiên bản giải.', 409);
  if (!['all', 'validate', 'game'].includes(queue)) fail('Queue không hợp lệ.');
  return (await transaction(db, async () => {
    (await db.prepare('INSERT INTO workers(id,seen,runtime) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen,runtime=excluded.runtime').run(worker, now, runtime));
    // Expired leases are fenced by a new random token. Old workers cannot submit results.
    (await db.prepare("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease=NULL,worker=NULL WHERE status='running' AND until<=?").run(now));
    const row = (await db.prepare(`SELECT j.* FROM jobs j JOIN events e ON e.id=j.event WHERE j.status='queued' AND j.next<=? AND e.paused=0
      AND (?='all' OR j.kind=?) AND ((j.kind='validate' AND e.status IN ('open','locking')) OR (j.kind='game' AND e.status IN ('groups','knockout')))
      ORDER BY CASE j.kind WHEN 'validate' THEN 0 ELSE 1 END,j.attempts,j.created,j.id LIMIT 1`).get(now, queue, queue));
    if (!row) return null;
    const payload = JSON.parse(row.payload);
    if (payload.engine !== ENGINE_VERSION || payload.runtime !== runtime) {
      (await db.prepare("UPDATE jobs SET status='failed',lease=NULL WHERE id=?").run(row.id));
      (await db.prepare('UPDATE events SET paused=1 WHERE id=?').run(row.event));
      (await log(db, worker, row.event, 'runtime-mismatch-paused', { job: row.id, expectedEngine: payload.engine, expectedRuntime: payload.runtime }));
      return null;
    }
    const lease = randomBytes(24).toString('hex');
    (await db.prepare("UPDATE jobs SET status='running',lease=?,until=?,attempts=attempts+1,worker=?,started_at=?,finished_at=NULL WHERE id=?").run(lease, now + 90000, worker, now, row.id));
    const sourceFor = async (submission, expected) => {
      const v = (await db.prepare('SELECT source,sha FROM submissions WHERE id=?').get(submission));
      if (!v || v.sha !== expected || sha(v.source) !== expected) fail('Bài nộp lưu trữ không khớp hash.', 500);
      return v.source;
    };
    if (row.kind === 'validate') payload.source = (await sourceFor(payload.submission, payload.sha));
    else for (const seat of ['p1', 'p2']) payload[seat].source = (await sourceFor(payload[seat].submission, payload[seat].sha));
    return { id: row.id, kind: row.kind, lease, payload, expires: now + 90000 };
  }));
}
async function renewHeartbeat(db, worker, job, lease) {
  const now = Date.now();
  const r = (await db.prepare("UPDATE jobs SET until=? WHERE id=? AND worker=? AND lease=? AND status='running' AND until>?").run(now + 90000, job, worker, lease, now));
  if (!r.changes) fail('Lease đã hết hạn hoặc không thuộc worker.', 409);
  (await db.prepare('UPDATE workers SET seen=? WHERE id=?').run(now, worker));
  return { ok: true };
}

export function verifyOfficial(payload, result) {
  if (payload.engine !== ENGINE_VERSION || payload.runtime !== RUNTIME_VERSION) fail('Job thuộc phiên bản đã khóa khác. Không chấm bằng runtime mới.', 409);
  if (!result || result.engine !== ENGINE_VERSION || result.runtime !== RUNTIME_VERSION || !Array.isArray(result.moves) || result.moves.length > payload.config.maxPlies) fail('Replay hoặc phiên bản bộ chấm không hợp lệ.');
  if (result.p1sha !== payload.p1.sha || result.p2sha !== payload.p2.sha || result.seed !== payload.seed) fail('Replay không khớp bài nộp đã khóa.');
  const board = createInitialBoard(); let winner = null;
  for (let i = 0; i < result.moves.length; i++) {
    if (winner) fail('Replay có nước đi sau khi trận đã kết thúc.');
    const step = applyMove(board, result.moves[i], i % 2 ? 'P2' : 'P1'); winner = step.winner;
  }
  if (result.reason === 'goal') { if (!winner) fail('Replay chưa có đội tới đích.'); }
  else if (result.reason === 'max_plies') { if (winner || result.moves.length !== payload.config.maxPlies) fail('Replay chưa đủ lượt để hòa.'); }
  else if (result.reason === 'no_moves') { const player = result.moves.length % 2 ? 'P2' : 'P1'; if (winner || legalMoves(board, player).length) fail('Bot vẫn có nước hợp lệ.'); winner = player === 'P1' ? 'P2' : 'P1'; }
  else if (['bot_error', 'timeout', 'output_limit', 'invalid_move'].includes(result.reason)) {
    if (winner || !['P1', 'P2'].includes(result.faultPlayer)) fail('Thiếu chứng cứ xử thua bot.');
    // Startup failures may happen before that player's turn. Move failures must match turn.
    if (result.phase !== 'startup' && result.faultPlayer !== (result.moves.length % 2 ? 'P2' : 'P1')) fail('Bot bị xử thua không đúng lượt.');
    winner = result.faultPlayer === 'P1' ? 'P2' : 'P1';
  } else fail('Lý do kết thúc không hợp lệ.');
  if (result.winner !== winner) fail('Kết quả không khớp replay.');
}
export async function finishJob(db, worker, job, lease, result) {
  return (await transaction(db, async () => {
    const row = (await db.prepare('SELECT * FROM jobs WHERE id=?').get(job));
    if (!row) fail('Không tìm thấy job.', 404);
    const hash = sha(encode(result));
    if (row.status === 'done' && row.lease === lease && row.worker === worker && row.result_hash === hash) return { ok: true, duplicate: true };
    if (row.status !== 'running' || row.lease !== lease || row.worker !== worker || row.until <= Date.now()) fail('Kết quả cũ hoặc sai worker.', 409);
    const payload = JSON.parse(row.payload);
    if (payload.engine !== ENGINE_VERSION || payload.runtime !== RUNTIME_VERSION) fail('Phiên bản job đã khóa không khớp control hiện tại.', 409);
    if (row.kind === 'validate') {
      const verdict = z.object({ valid: z.boolean(), message: z.string().max(1000), sha: z.string(), engine: z.literal(ENGINE_VERSION), runtime: z.literal(RUNTIME_VERSION) }).strict().parse(result);
      if (verdict.sha !== payload.sha) fail('Hash bài kiểm tra không khớp.');
      (await db.prepare('UPDATE submissions SET status=?,verdict=? WHERE id=?').run(verdict.valid ? 'valid' : 'invalid', verdict.message, row.subject));
    } else {
      verifyOfficial(payload, result);
      (await db.prepare('UPDATE games SET result=?,completed=1,winner=?,reason=? WHERE id=? AND result IS NULL').run(encode(result), result.winner, result.reason, row.subject));
    }
    (await db.prepare("UPDATE jobs SET status='done',result_hash=?,finished_at=? WHERE id=?").run(hash, Date.now(), job));
    (await log(db, worker, row.event, 'result', { job, resultHash: hash }));
    if (row.kind === 'game') (await settleSeries(db, (await db.prepare('SELECT series FROM games WHERE id=?').get(row.subject)).series));
    return { ok: true };
  }));
}
export async function failJob(db, worker, job, lease) {
  return (await transaction(db, async () => {
    const row = (await db.prepare("SELECT * FROM jobs WHERE id=? AND worker=? AND lease=? AND status='running' AND until>?").get(job, worker, lease, Date.now()));
    if (!row) fail('Lease không còn hợp lệ.', 409);
    (await db.prepare("UPDATE jobs SET status=?,lease=NULL,next=? WHERE id=?").run(row.attempts >= 3 ? 'failed' : 'queued', Date.now() + 5000 * row.attempts, job));
    (await log(db, worker, row.event, 'infrastructure-failure', { job, attempt: row.attempts }));
    return { ok: true };
  }));
}
async function dispatchAction(db, user, body) {
  if (!user) fail('Bạn cần đăng nhập.', 401);
  const event = body.event;
  switch (body.action) {
    case 'create': return (await createEvent(db, user, body));
    case 'config': return (await editConfig(db, user, event, body.config));
    case 'team': return (await addTeam(db, user, event, body));
    case 'invite': return (await invite(db, user, event, body));
    case 'join': return (await join(db, user, body.token));
    case 'submit': return (await submit(db, user, event, body.source));
    case 'freeze': return (await freeze(db, user, event));
    case 'open': {
      admin(user); const e = (await eventOf(db, event));
      if (e.status !== 'draft' || Date.parse(e.config.deadline) <= Date.now()) fail('Giải cần ở bản nháp và có hạn nộp trong tương lai.');
      (await db.prepare("UPDATE events SET status='open' WHERE id=?").run(event)); (await log(db, user.id, event, 'open')); return { ok: true };
    }
    case 'pause': {
      admin(user); const e = (await eventOf(db, event));
      (await db.prepare('UPDATE events SET paused=? WHERE id=?').run(e.paused ? 0 : 1, event)); (await log(db, user.id, event, e.paused ? 'resume' : 'pause')); return { ok: true };
    }
    case 'publish': {
      admin(user); if ((await eventOf(db, event)).status !== 'review') fail('Giải chưa hoàn tất để công bố.');
      (await db.prepare("UPDATE events SET status='published' WHERE id=?").run(event)); (await log(db, user.id, event, 'publish')); return { ok: true };
    }
    case 'retry': {
      admin(user); const e = (await eventOf(db, event));
      if (['review', 'published'].includes(e.status)) fail('Không thể chấm lại kết quả đã hoàn tất.');
      (await db.prepare("UPDATE jobs SET status='queued',attempts=0,lease=NULL,next=0 WHERE id=? AND event=? AND status='failed'").run(body.job, event));
      (await log(db, user.id, event, 'retry', { job: body.job })); return { ok: true };
    }
    case 'revoke': {
      admin(user); if (!['draft', 'open'].includes((await eventOf(db, event)).status)) fail('Danh sách đã khóa.');
      (await db.prepare('DELETE FROM members WHERE event=? AND user=?').run(event, body.user)); (await log(db, user.id, event, 'revoke', { user: body.user })); return { ok: true };
    }
    default: fail('Thao tác không hợp lệ.');
  }
}

async function readOverview(db, user, event) {
  const events = (await db.prepare('SELECT * FROM events ORDER BY created DESC LIMIT 50').all()).map(decode);
  if (!event) return { events, user: user ? { id: user.id, name: user.name, admin: !!user.is_admin } : null, runtime: RUNTIME_VERSION };
  const e = (await eventOf(db, event)), isAdmin = !!user?.is_admin;
  const owned = user ? (await db.prepare('SELECT team FROM members WHERE event=? AND user=?').get(event, user.id))?.team : null;
  const teams = (await db.prepare('SELECT id,name,seed,repo FROM teams WHERE event=? ORDER BY seed').all(event));
  const submissions = owned ? (await db.prepare('SELECT id,sha,status,verdict,created,provenance FROM submissions WHERE team=? ORDER BY created DESC LIMIT 30').all(owned)) : [];
  const series = (await db.prepare('SELECT s.*,a.name a_name,b.name b_name FROM series s JOIN teams a ON a.id=s.a JOIN teams b ON b.id=s.b WHERE s.event=? ORDER BY s.stage,s.round,s.rowid LIMIT 500').all(event));
  const jobs = (await db.prepare('SELECT status,kind,COUNT(*) count FROM jobs WHERE event=? GROUP BY status,kind').all(event));
  const recentGames = (await db.prepare('SELECT g.id,g.ordinal,g.p1,g.p2,g.result IS NOT NULL completed,s.stage,a.name p1_name,b.name p2_name FROM games g JOIN series s ON s.id=g.series JOIN teams a ON a.id=g.p1 JOIN teams b ON b.id=g.p2 WHERE s.event=? ORDER BY g.rowid DESC LIMIT 50').all(event));
  const workers = isAdmin ? (await db.prepare('SELECT id,seen,runtime FROM workers ORDER BY seen DESC LIMIT 50').all()) : [];
  const failed = isAdmin ? (await db.prepare("SELECT id,kind,subject,attempts FROM jobs WHERE event=? AND status='failed' LIMIT 50").all(event)) : [];
  const members = isAdmin ? (await db.prepare('SELECT * FROM members WHERE event=?').all(event)) : [];
  const audit = isAdmin ? (await db.prepare('SELECT * FROM audit WHERE event=? ORDER BY id DESC LIMIT 50').all(event)) : [];
  return { ...(await overview(db, user)), event: e, owned, teams, submissions, standings: (await standings(db, event)), series, jobs, recentGames, workers, failed, members, audit };
}
async function readReplay(db, game) {
  const row = (await db.prepare('SELECT g.*,s.event FROM games g JOIN series s ON s.id=g.series WHERE g.id=?').get(game));
  if (!row || !row.result) fail('Trận chưa có replay.', 404);
  return { ...row, result: JSON.parse(row.result) };
}
async function readExport(db, user, event) {
  admin(user); const e = (await eventOf(db, event));
  return { exportedAt: new Date().toISOString(), event: e, standings: (await standings(db, event)), teams: (await db.prepare('SELECT * FROM teams WHERE event=?').all(event)), entries: (await db.prepare('SELECT * FROM entries WHERE event=?').all(event)), series: (await db.prepare('SELECT * FROM series WHERE event=?').all(event)), games: (await db.prepare('SELECT g.* FROM games g JOIN series s ON s.id=g.series WHERE s.event=?').all(event)).map(g => ({ ...g, result: g.result ? JSON.parse(g.result) : null })), submissions: (await db.prepare('SELECT v.* FROM submissions v JOIN entries x ON x.submission=v.id WHERE x.event=?').all(event)), audit: (await db.prepare('SELECT * FROM audit WHERE event=? ORDER BY id').all(event)) };
}

// Keep checks and writes in the same transaction on both SQLite and PostgreSQL.
export const action = (db, ...args) => transaction(db, () => dispatchAction(db, ...args));
export const submit = (db, ...args) => transaction(db, () => saveSubmission(db, ...args));
export const heartbeat = (db, ...args) => transaction(db, () => renewHeartbeat(db, ...args));
export const overview = (db, ...args) => transaction(db, () => readOverview(db, ...args));
export const replay = (db, ...args) => transaction(db, () => readReplay(db, ...args));
export const exportEvent = (db, ...args) => transaction(db, () => readExport(db, ...args));
