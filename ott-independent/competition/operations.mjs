import { configSchema, RUNTIME_VERSION, fail, transaction } from './store.mjs';

const WINDOW_MS = 15 * 60000;
const LIVE_MS = 90000;
const faults = "'bot_error','timeout','output_limit','invalid_move'";
const numeric = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v || 0)]));
const eventRow = row => row && ({ ...row, config: JSON.parse(row.config) });

export function freezeChecks(event, summary, workerSummary, now) {
  const configValid = configSchema.safeParse(event.config).success;
  const c = event.config, n = summary.eligibleTeams;
  const minimum = c.groupCount * Math.max(2, c.qualifiers), maximum = c.groupCount * 32;
  const checks = [
    { id: 'phase', label: 'Giải đang nhận hoặc chốt bài', state: ['open', 'locking'].includes(event.status) ? 'pass' : 'block', detail: 'Chỉ khóa danh sách từ giai đoạn nhận bài hoặc chốt bài.' },
    { id: 'deadline', label: 'Đã đến hạn nộp', state: Date.parse(c.deadline) <= now ? 'pass' : 'block', detail: c.deadline },
    { id: 'config', label: 'Cấu hình vòng đấu hợp lệ', state: configValid ? 'pass' : 'block', detail: `${c.groupCount} bảng · ${c.qualifiers} suất/bảng · hai ván đổi bên.` },
    { id: 'pending', label: 'Đã kiểm tra hết bài nộp', state: summary.pendingSubmissions === 0 ? 'pass' : 'block', detail: `${summary.pendingSubmissions} phiên bản còn chờ kiểm tra, kể cả phiên bản cũ.` },
    { id: 'entrants', label: 'Đủ đội có bài hợp lệ trước hạn', state: n >= minimum && n <= maximum ? 'pass' : 'block', detail: `${n} đội đủ điều kiện; cấu hình yêu cầu ${minimum}–${maximum} đội.` },
    { id: 'excluded', label: 'Rà soát đội chưa đủ điều kiện', state: summary.rosterTeams > n ? 'warn' : 'pass', detail: `${summary.rosterTeams - n} đội chưa có bài hợp lệ trước hạn; các đội này không được đưa vào lịch.` },
    { id: 'worker', label: 'Bộ chấm đúng phiên bản đang kết nối', state: workerSummary.compatible > 0 ? 'pass' : 'warn', detail: `${workerSummary.compatible} worker có tín hiệu trong 90 giây qua. Đây là tài nguyên dùng chung giữa các giải.` },
    { id: 'paused', label: 'Cho phép nhận công việc mới', state: event.paused ? 'warn' : 'pass', detail: event.paused ? 'Giải đang tạm dừng; cần tiếp tục chấm để xử lý lịch mới.' : 'Giải không tạm dừng.' },
  ];
  const small = Math.floor(n / c.groupCount), larger = n % c.groupCount;
  return { checks, canFreeze: checks.every(x => x.state !== 'block'), eligibleTeams: n,
    expectedGroupGames: configValid ? larger * (small + 1) * small + (c.groupCount - larger) * small * (small - 1) : null };
}

async function readOperations(db, user, eventId, now) {
  if (!user?.is_admin) fail('Chỉ ban tổ chức được xem màn hình điều hành.', 403);
  const events = (await db.prepare('SELECT id,name,status,config,paused,created FROM events ORDER BY created DESC LIMIT 50').all()).map(eventRow);
  const base = { events, user: { id: user.id, name: user.name, admin: true }, runtime: RUNTIME_VERSION };
  if (!eventId) return base;
  const event = eventRow(await db.prepare('SELECT id,name,status,config,paused,created FROM events WHERE id=?').get(eventId));
  if (!event) fail('Không tìm thấy giải đấu.', 404);
  // Summaries stay in SQL. No standings calculation, source, replay or full roster.
  const teamStats = await db.prepare(`SELECT COUNT(*) "rosterTeams",
    SUM(CASE WHEN EXISTS(SELECT 1 FROM members m WHERE m.team=t.id AND m.event=t.event) THEN 1 ELSE 0 END) "activatedTeams",
    SUM(CASE WHEN v.id IS NOT NULL THEN 1 ELSE 0 END) "submittedTeams",
    SUM(CASE WHEN v.id IS NULL THEN 1 ELSE 0 END) "noSubmissionTeams",
    SUM(CASE WHEN v.status='valid' THEN 1 ELSE 0 END) "latestValidTeams",
    SUM(CASE WHEN v.status='invalid' THEN 1 ELSE 0 END) "latestInvalidTeams",
    SUM(CASE WHEN v.status='pending' THEN 1 ELSE 0 END) "pendingTeams",
    SUM(CASE WHEN EXISTS(SELECT 1 FROM submissions s WHERE s.team=t.id AND s.status='valid' AND s.created<?) THEN 1 ELSE 0 END) "eligibleTeams"
    FROM teams t LEFT JOIN submissions v ON v.id=(SELECT id FROM submissions WHERE team=t.id ORDER BY created DESC,id DESC LIMIT 1)
    WHERE t.event=?`).get(Date.parse(event.config.deadline), eventId);
  const submissionStats = await db.prepare(`SELECT COUNT(*) submissions,
    SUM(CASE WHEN s.status='pending' THEN 1 ELSE 0 END) "pendingSubmissions"
    FROM submissions s JOIN teams t ON t.id=s.team WHERE t.event=?`).get(eventId);
  const memberStats = await db.prepare('SELECT COUNT(*) members FROM members WHERE event=?').get(eventId);
  const summary = { ...numeric(teamStats), ...numeric(submissionStats), ...numeric(memberStats) };
  const jobs = (await db.prepare('SELECT kind,status,COUNT(*) count FROM jobs WHERE event=? GROUP BY kind,status').all(eventId)).map(row => ({ ...row, count: Number(row.count) }));
  const queueRows = await db.prepare(`SELECT kind,
    MIN(CASE WHEN status='queued' THEN created END) "oldestCreated",
    SUM(CASE WHEN status='running' AND until<=? THEN 1 ELSE 0 END) expired,
    SUM(CASE WHEN status='done' AND finished_at>=? AND finished_at<=? THEN 1 ELSE 0 END) "completedRecent",
    MIN(CASE WHEN status='done' AND finished_at>=? AND finished_at<=? THEN finished_at END) "firstRecent",
    MAX(CASE WHEN status='done' AND finished_at>=? AND finished_at<=? THEN finished_at END) "lastRecent",
    AVG(CASE WHEN status='done' AND finished_at>=? AND finished_at<=? AND started_at IS NOT NULL AND finished_at>=started_at THEN finished_at-started_at END) "meanMs"
    FROM jobs WHERE event=? GROUP BY kind`).all(now, now - WINDOW_MS, now, now - WINDOW_MS, now, now - WINDOW_MS, now, now - WINDOW_MS, now, eventId);
  const workerSummary = numeric(await db.prepare(`SELECT COUNT(*) known,
    SUM(CASE WHEN seen>? THEN 1 ELSE 0 END) online,
    SUM(CASE WHEN seen>? AND runtime=? THEN 1 ELSE 0 END) compatible
    FROM workers`).get(now - LIVE_MS, now - LIVE_MS, RUNTIME_VERSION));
  const workers = (await db.prepare(`SELECT w.id,w.seen,w.runtime,
    (SELECT COUNT(*) FROM jobs j WHERE j.worker=w.id AND j.event=? AND j.status='running' AND j.until>?) "activeJobs"
    FROM workers w ORDER BY w.seen DESC,w.id LIMIT 20`).all(eventId, now)).map(w => ({ ...w, activeJobs: Number(w.activeJobs), online: w.seen > now - LIVE_MS, compatible: w.runtime === RUNTIME_VERSION }));
  const queues = ['validate', 'game'].map(kind => {
    const stats = queueRows.find(row => row.kind === kind) || {};
    const counts = Object.fromEntries(['queued', 'running', 'done', 'failed'].map(status => [status, jobs.find(j => j.kind === kind && j.status === status)?.count || 0]));
    const completedRecent = Number(stats.completedRecent || 0), ratePerMinute = completedRecent / 15;
    const backlog = counts.queued + counts.running;
    const enough = completedRecent >= 5 && Number(stats.lastRecent) - Number(stats.firstRecent) >= 60000;
    const canEstimate = enough && workerSummary.compatible > 0 && !event.paused && !counts.failed && !Number(stats.expired || 0);
    return { kind, ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0), expired: Number(stats.expired || 0),
      oldestCreated: stats.oldestCreated == null ? null : Number(stats.oldestCreated),
      completedRecent, ratePerMinute: Number(ratePerMinute.toFixed(2)), meanSeconds: stats.meanMs == null ? null : Number(stats.meanMs) / 1000,
      etaSeconds: canEstimate && backlog ? Math.ceil(backlog / ratePerMinute * 60) : null };
  });
  const infrastructure = await db.prepare(`SELECT j.id,j.kind,j.status,j.subject,j.attempts,j.created,j.until,
    COALESCE(t.name,a.name || ' — ' || b.name,j.subject) label
    FROM jobs j LEFT JOIN submissions s ON j.kind='validate' AND s.id=j.subject LEFT JOIN teams t ON t.id=s.team
    LEFT JOIN games g ON j.kind='game' AND g.id=j.subject LEFT JOIN teams a ON a.id=g.p1 LEFT JOIN teams b ON b.id=g.p2
    WHERE j.event=? AND (j.status='failed' OR (j.status='running' AND j.until<=?))
    ORDER BY j.created,j.id LIMIT 25`).all(eventId, now);
  const invalid = await db.prepare(`SELECT s.id,s.verdict,s.created,t.name label FROM teams t JOIN submissions s
    ON s.id=(SELECT id FROM submissions WHERE team=t.id ORDER BY created DESC,id DESC LIMIT 1)
    WHERE t.event=? AND s.status='invalid' ORDER BY s.created DESC,s.id LIMIT 25`).all(eventId);
  const botGames = await db.prepare(`SELECT g.id,g.reason,a.name p1,b.name p2 FROM games g JOIN series s ON s.id=g.series
    JOIN teams a ON a.id=g.p1 JOIN teams b ON b.id=g.p2 WHERE s.event=? AND g.reason IN (${faults})
    ORDER BY g.rowid DESC LIMIT 25`).all(eventId);
  const botGameCount = Number((await db.prepare(`SELECT COUNT(*) n FROM games g JOIN series s ON s.id=g.series
    WHERE s.event=? AND g.reason IN (${faults})`).get(eventId)).n);
  const audit = await db.prepare('SELECT id,actor,action,created FROM audit WHERE event=? ORDER BY created DESC,id DESC LIMIT 20').all(eventId);
  return { ...base, event, jobs, operations: { sampledAt: now, summary, queues, workers, workerSummary,
    preflight: freezeChecks(event, summary, workerSummary, now), issues: { infrastructure, invalid, botGames, botGameCount }, audit } };
}

export const operations = (db, user, event, now = Date.now()) => transaction(db, () => readOperations(db, user, event, now));
