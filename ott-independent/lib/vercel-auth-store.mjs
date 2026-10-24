import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { database } from './postgres.mjs';
import { accountAllowed, normalizeEmail, requireVnuEmail } from './account-policy.mjs';

const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
let hashing = 0;
async function hash(password, salt) {
  if (hashing >= 4) throw Object.assign(new Error('Hệ thống đang bận. Hãy thử lại.'), { status: 503 });
  hashing++;
  try { return await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }
  finally { hashing--; }
}
export async function sessionUser(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const user = await database().prepare('SELECT u.id,u.email,u.name,u.is_admin FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').bind(digest(token), Date.now()).first();
  return accountAllowed(user) ? user : null;
}
export async function register({ email, name, password }) {
  email = requireVnuEmail(email);
  const salt = randomBytes(16).toString('hex'), passwordHash = (await hash(password, salt)).toString('hex');
  const id = `vercel_${randomUUID()}`, db = database();
  try { await db.prepare('INSERT INTO auth_users(id,email,name,salt,password_hash,created) VALUES(?,?,?,?,?,?)').bind(id, email, name, salt, passwordHash, Date.now()).run(); }
  catch (e) { if (e.code === '23505') throw Object.assign(new Error('Không thể tạo tài khoản này. Thử đăng nhập hoặc dùng email khác.'), { status: 409 }); throw e; }
  return { id, email, name };
}
export async function authenticate(email, password) {
  email = normalizeEmail(email);
  const user = await database().prepare('SELECT * FROM auth_users WHERE email=?').bind(email).first();
  const candidate = await hash(password, user?.salt || 'unregistered-account-dummy-salt');
  return timingSafeEqual(candidate, user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64)) && accountAllowed(user) ? user : null;
}
export async function newSession(userId) {
  const token = randomBytes(32).toString('hex'), stamp = Date.now();
  const db = database();
  await db.prepare('DELETE FROM auth_sessions WHERE expires<=?').bind(stamp).run();
  await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires,created) VALUES(?,?,?,?)').bind(digest(token), userId, stamp + 604800000, stamp).run();
  await db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM auth_sessions WHERE user_id=? ORDER BY created DESC LIMIT 10)').bind(userId,userId).run();
  return token;
}
export async function revokeSession(token) {
  if (/^[a-f0-9]{64}$/.test(token || '')) await database().prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(digest(token)).run();
}
export async function consumeAttempt(ip, email) {
  const db = database(), stamp = Date.now();
  // Each increment is atomic in Postgres, including simultaneous requests from
  // separate Vercel instances. A process-local counter cannot enforce this.
  // Shared university NATs must not lock out an entire class after 30 logins.
  for (const [key, limit] of [[`ip:${ip}`, 10000], [`email:${email}`, 10]]) {
    const row = await db.prepare('INSERT INTO auth_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_attempts.expires<=? THEN 1 ELSE auth_attempts.count+1 END,expires=CASE WHEN auth_attempts.expires<=? THEN excluded.expires ELSE auth_attempts.expires END RETURNING count').bind(digest(key), stamp + 900000, stamp, stamp).first();
    if (row.count > limit) return false;
  }
  return true;
}
