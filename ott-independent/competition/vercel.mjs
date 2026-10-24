import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { sessionUser } from '../lib/vercel-auth-store.mjs';
import { withCompetition } from './postgres.mjs';
import { operations } from './operations.mjs';
import { overview, action, leaseJob, heartbeat, finishJob, failJob, replay, exportEvent, submit, fail } from './store.mjs';

const hash = value => createHash('sha256').update(value).digest();
async function bodyOf(request, limit) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) fail('Cần dữ liệu JSON.', 415);
  const reader = request.body?.getReader(), chunks = []; let size = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); fail('Dữ liệu quá lớn.', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('JSON không hợp lệ.'); }
}
async function gitSource(repo, commit) {
  z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).parse(repo);
  z.string().regex(/^[a-f0-9]{40}$/).parse(commit);
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/bot.py`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) fail('Không lấy được bot.py. Dùng repo công khai hoặc tải tệp lên trực tiếp.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 65536) { await reader.cancel(); fail('bot.py vượt 64 KiB.'); } chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}
export async function competitionRequest(request, judge = false) {
  const send = (status, data, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
  try {
    if (process.env.ARENA_DEPLOYMENT === 'docker') fail('API này do gateway Docker xử lý.', 503);
    if (judge) {
      const key = process.env.JUDGE_TOKEN_FILE ? readFileSync(process.env.JUDGE_TOKEN_FILE, 'utf8').trim() : process.env.JUDGE_TOKEN || '';
      if (key.length < 32 || !timingSafeEqual(hash(request.headers.get('authorization') || ''), hash(`Bearer ${key}`))) fail('Worker chưa được cấp quyền.', 401);
      if (request.method !== 'POST') fail('Method not allowed', 405);
      const body = await bodyOf(request, 262144), worker = z.string().min(1).max(100).parse(body.worker);
      const result = await withCompetition(db => {
        if (body.action === 'lease') return leaseJob(db, worker, body.runtime, Date.now(), body.queue || 'all');
        if (body.action === 'heartbeat') return heartbeat(db, worker, body.job, body.lease);
        if (body.action === 'finish') return finishJob(db, worker, body.job, body.lease, body.result);
        if (body.action === 'fail') return failJob(db, worker, body.job, body.lease);
        fail('Thao tác worker không hợp lệ.');
      }, { write: true });
      return send(200, result);
    }
    const url = new URL(request.url);
    if (request.method === 'POST' && (request.headers.get('origin') !== (process.env.PUBLIC_ORIGIN || url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')) fail('Yêu cầu không hợp lệ. Mở lại trang rồi thử lại.', 403);
    const token = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('arena_session='))?.slice(14);
    const user = await sessionUser(token);
    if (request.method === 'GET') {
      const event = url.searchParams.get('event');
      if (url.searchParams.has('dashboard')) {
        if (!user?.is_admin) fail('Chỉ ban tổ chức được xem màn hình điều hành.', 403);
        return send(200, await withCompetition(db => operations(db, user, event)));
      }
      const result = await withCompetition(db => url.searchParams.has('game') ? replay(db, url.searchParams.get('game')) : url.searchParams.has('export') ? exportEvent(db, user, event) : overview(db, user, event));
      return send(200, result, url.searchParams.has('export') ? { 'Content-Disposition': 'attachment; filename="tournament-export.json"' } : {});
    }
    if (request.method !== 'POST') fail('Method not allowed', 405);
    if (!user) fail('Bạn cần đăng nhập.', 401);
    const body = await bodyOf(request, 100000);
    if (body.action === 'git') {
      const membership = await withCompetition(db => db.prepare('SELECT t.repo FROM members m JOIN teams t ON t.id=m.team WHERE m.event=? AND m.user=?').get(body.event, user.id));
      if (!membership?.repo) fail('BTC chưa gắn GitHub repository cho đội.', 403);
      const source = await gitSource(membership.repo, body.commit);
      return send(200, await withCompetition(db => submit(db, user, body.event, source, `github:${membership.repo}@${body.commit}:bot.py`), { write: true, submission: { event: body.event, user: user.id } }));
    }
    if (body.action === 'submit') {
      z.string().min(1).max(100).parse(body.event);
      return send(200, await withCompetition(db => submit(db, user, body.event, body.source), { write: true, submission: { event: body.event, user: user.id } }));
    }
    return send(200, await withCompetition(db => action(db, user, body), { write: true }));
  } catch (error) {
    const validation = error instanceof z.ZodError, conflict = error.code === '23505';
    const status = error.status || (validation || conflict ? 400 : 503);
    return send(status, { error: validation ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : conflict ? 'Tên đội, hạt giống hoặc sinh viên đã tồn tại.' : error.status ? error.message : 'Hệ thống đang bận. Hãy thử lại sau vài giây; gửi lại cùng bài sẽ không tạo bản trùng.' }, status === 503 || status === 429 ? { 'Retry-After': status === 429 ? '5' : '3' } : {});
  }
}
