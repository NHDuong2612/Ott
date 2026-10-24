import { readFileSync } from 'node:fs';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { operations } from './operations.mjs';
import { openCompetition, overview, action, leaseJob, heartbeat, finishJob, failJob, replay, exportEvent, submit, fail } from './store.mjs';

async function bodyOf(req, limit) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail('Cần dữ liệu JSON.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail('Dữ liệu quá lớn.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('JSON không hợp lệ.'); }
}
export function competitionHandler(directory) {
  const db = openCompetition(directory);
  let key = '';
  if (process.env.JUDGE_TOKEN_FILE) key = readFileSync(process.env.JUDGE_TOKEN_FILE, 'utf8').trim();
  else key = process.env.JUDGE_TOKEN || '';
  const hash = value => createHash('sha256').update(value).digest();
  return {
    close: () => db.close(),
    async handle(req, res, url, user) {
      if (!['/api/competition', '/api/judge'].includes(url.pathname)) return false;
      const send = (status, data, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(data)); };
      try {
        if (url.pathname === '/api/judge') {
          if (key.length < 32 || !timingSafeEqual(hash(req.headers.authorization || ''), hash(`Bearer ${key}`))) fail('Worker chưa được cấp quyền.', 401);
          if (req.method !== 'POST') fail('Method not allowed', 405);
          const body = await bodyOf(req, 262144);
          const worker = z.string().min(1).max(100).parse(body.worker);
          if (body.action === 'lease') send(200, (await leaseJob(db, worker, body.runtime, Date.now(), body.queue || 'all')));
          else if (body.action === 'heartbeat') send(200, (await heartbeat(db, worker, body.job, body.lease)));
          else if (body.action === 'finish') send(200, (await finishJob(db, worker, body.job, body.lease, body.result)));
          else if (body.action === 'fail') send(200, (await failJob(db, worker, body.job, body.lease)));
          else fail('Thao tác worker không hợp lệ.');
        } else if (req.method === 'GET') {
          const event = url.searchParams.get('event');
          if (url.searchParams.has('dashboard')) send(200, await operations(db, user, event));
          else if (url.searchParams.has('game')) send(200, (await replay(db, url.searchParams.get('game'))));
          else if (url.searchParams.has('export')) send(200, (await exportEvent(db, user, event)), { 'Content-Disposition': 'attachment; filename="tournament-export.json"' });
          else send(200, (await overview(db, user, event)));
        } else if (req.method === 'POST') {
          if (!user) fail('Bạn cần đăng nhập.', 401);
          const body = await bodyOf(req, 100000);
          if (body.action === 'git') {
            const membership = (await db.prepare('SELECT t.repo FROM members m JOIN teams t ON t.id=m.team WHERE m.event=? AND m.user=?').get(body.event, user.id));
            if (!membership?.repo) fail('BTC chưa gắn GitHub repository cho đội.', 403);
            const commit = z.string().regex(/^[a-f0-9]{40}$/).parse(body.commit);
            // Exact approved public repo + immutable commit + fixed file. No clone, hooks, redirects or build scripts.
            const response = await fetch(`https://raw.githubusercontent.com/${membership.repo}/${commit}/bot.py`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
            if (!response.ok) fail('Không lấy được bot.py. Dùng repo công khai hoặc tải tệp lên trực tiếp.');
            const parts = []; let bytes = 0;
            for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 65536) { await response.body.cancel().catch(() => {}); fail('bot.py vượt 64 KiB.'); } parts.push(Buffer.from(chunk)); }
            const source = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
            send(200, (await submit(db, user, body.event, source, `github:${membership.repo}@${commit}:bot.py`)));
          } else send(200, (await action(db, user, body)));
        } else fail('Method not allowed', 405);
      } catch (error) {
        const validation = error instanceof z.ZodError;
        const constraint = /UNIQUE constraint failed/.test(error.message);
        send(error.status || (validation || constraint ? 400 : 500), { error: validation ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : constraint ? 'Tên đội, hạt giống hoặc sinh viên đã tồn tại.' : error.status ? error.message : 'Không thể hoàn tất. Hãy kiểm tra worker hoặc liên hệ BTC.' });
      }
      return true;
    },
  };
}
