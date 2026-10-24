import { createServer, request as proxyRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { openStore, authenticate, register, sessionUser, newSession, consumeAttempt, digest } from './auth-store.mjs';
import { authPage } from './auth-view.mjs';
import { competitionHandler } from '../competition/http.mjs';

const safeReturn = value => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const parsed = new URL(value, 'http://arena.invalid');
  if (['/login', '/register', '/logout', '/signin-with-chatgpt', '/signout-with-chatgpt'].includes(parsed.pathname)) return '/';
  return parsed.pathname + parsed.search + parsed.hash;
};
const cookies = request => Object.fromEntries((request.headers.cookie || '').split(';').map(s => s.trim().split(/=(.*)/s).slice(0, 2)));

export async function startGateway({ port = Number(process.env.PORT || 3000), origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3000', directory = process.env.DATA_DIR || '/data', upstream = 'http://127.0.0.1:8787' } = {}) {
  const publicUrl = new URL(origin);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin.');
  origin = publicUrl.origin;
  const secure = publicUrl.protocol === 'https:' ? '; Secure' : '';
  const db = openStore(directory), css = readFileSync(new URL('./auth.css', import.meta.url));
  const competition = competitionHandler(directory);
  const cookie = (name, token, ttl = 604800) => `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure}`;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const send = (status, text, type = 'text/plain; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(text); };
    const redirect = to => { res.writeHead(303, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === '/health') {
        const r = await fetch(upstream + '/favicon.svg', { signal: AbortSignal.timeout(3000) }); await r.arrayBuffer();
        db.prepare('SELECT 1').get(); send(r.ok ? 200 : 503, r.ok ? 'ok' : 'unavailable'); return;
      }
      if (url.pathname === '/api/judge') { await competition.handle(req, res, url, null); return; }
      if (req.headers.host !== publicUrl.host) { send(421, `Open the arena at ${origin}`); return; }
      if (url.pathname === '/auth.css') { send(200, css, 'text/css; charset=utf-8'); return; }
      const jar = cookies(req), user = sessionUser(db, jar.arena_session);
      // Worker requests use a separate secret, never browser identity or cookies.
      if (url.pathname === '/signin-with-chatgpt') { redirect('/login?return_to=' + encodeURIComponent(safeReturn(url.searchParams.get('return_to')))); return; }
      if (url.pathname === '/signout-with-chatgpt') { redirect('/logout'); return; }
      const mode = url.pathname.slice(1), isAuth = ['login', 'register', 'logout'].includes(mode);
      let returnTo = safeReturn(url.searchParams.get('return_to'));
      function form(status = 200, error = '', values = {}) {
        const csrf = randomBytes(32).toString('hex');
        res.setHeader('Set-Cookie', cookie('arena_csrf', csrf, 3600));
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
        send(status, authPage({ mode, csrf, returnTo, error, ...values }), 'text/html; charset=utf-8');
      }
      if (isAuth && req.method === 'GET') {
        if (mode !== 'logout' && user) { redirect(returnTo); return; }
        if (mode === 'logout' && !user) { redirect('/'); return; }
        form(); return;
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site')) { send(403, 'Yêu cầu không hợp lệ. Mở lại trang rồi thử lại.'); req.resume(); return; }
      if (await competition.handle(req, res, url, user)) return;
      if (isAuth) {
        if (req.method !== 'POST') { send(405, 'Method not allowed'); return; }
        if (!(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) { send(415, 'Unsupported form'); req.resume(); return; }
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 4096) { send(413, 'Dữ liệu quá lớn.'); return; } chunks.push(chunk); }
        const input = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        returnTo = safeReturn(input.get('return_to'));
        const csrf = input.get('csrf') || '';
        if (!/^[a-f0-9]{64}$/.test(csrf) || !/^[a-f0-9]{64}$/.test(jar.arena_csrf || '') || !timingSafeEqual(Buffer.from(csrf), Buffer.from(jar.arena_csrf))) { form(403, 'Phiên nhập liệu đã hết hạn. Vui lòng thử lại.'); return; }
        if (mode === 'logout') {
          if (jar.arena_session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(jar.arena_session));
          res.setHeader('Set-Cookie', [cookie('arena_session', '', 0), cookie('arena_csrf', '', 0)]); redirect('/'); return;
        }
        const email = (input.get('email') || '').trim().toLowerCase(), password = input.get('password') || '', name = (input.get('name') || '').trim();
        if (!consumeAttempt(db, req.socket.remoteAddress, email)) { res.setHeader('Retry-After', '900'); form(429, 'Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) { form(400, 'Nhập email hợp lệ và mật khẩu tối đa 128 ký tự.', { email, name }); return; }
        let account;
        if (mode === 'register') {
          if (name.length < 2 || name.length > 60 || password.length < 12 || password !== input.get('confirm')) { form(400, 'Tên cần 2–60 ký tự. Mật khẩu cần 12–128 ký tự và hai lần nhập phải khớp.', { email, name }); return; }
          try { account = await register(db, { email, name, password }); }
          catch (error) { if (error.status) { form(error.status, error.message, { email, name }); return; } throw error; }
        } else {
          account = await authenticate(db, email, password);
          if (!account) { form(401, 'Email hoặc mật khẩu chưa đúng.', { email }); return; }
        }
        if (jar.arena_session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(jar.arena_session));
        const token = newSession(db, account.id);
        res.setHeader('Set-Cookie', [cookie('arena_session', token), cookie('arena_csrf', '', 0)]); redirect(returnTo); return;
      }
      // The Worker is loopback-only. Identity can only come from a validated
      // session; never relay browser-supplied identity or forwarding headers.
      const headers = { ...req.headers };
      for (const key of Object.keys(headers)) if (/^(oai-|x-arena-|x-forwarded-|cf-)/i.test(key) || ['cookie','authorization','origin','connection','transfer-encoding'].includes(key)) delete headers[key];
      if (user) {
        headers['oai-authenticated-user-id'] = user.id;
        headers['oai-authenticated-user-email'] = user.email;
        headers['oai-authenticated-user-full-name'] = encodeURIComponent(user.name);
        headers['oai-authenticated-user-full-name-encoding'] = 'percent-encoded-utf-8';
        headers['x-arena-bootstrap'] = user.is_admin ? '1' : '0';
      }
      const backend = proxyRequest(new URL(url.pathname + url.search, upstream), { method: req.method, headers, timeout: 30000 }, response => {
        const outgoing = { ...response.headers, 'Cache-Control': 'no-store' };
        if (outgoing.location?.startsWith(upstream)) outgoing.location = origin + outgoing.location.slice(upstream.length);
        res.writeHead(response.statusCode, outgoing); response.pipe(res);
      });
      backend.on('timeout', () => backend.destroy());
      backend.on('error', () => { if (!res.headersSent) send(503, 'Đấu trường đang khởi động. Hãy thử lại.'); else res.destroy(); });
      req.on('aborted', () => backend.destroy()); req.pipe(backend);
    } catch (error) {
      // Never log request bodies, credentials, cookies, or database contents.
      if (!res.headersSent) send(error.status || 500, error.status ? error.message : 'Không thể hoàn tất yêu cầu. Hãy thử lại.'); else res.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => { db.close(); competition.close(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  return server;
}
