import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { accountAllowed, normalizeEmail, requireVnuEmail } from '../lib/account-policy.mjs';

const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'auth.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,is_admin INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  db.prepare('DELETE FROM attempts WHERE expires<=?').run(Date.now());
  return db;
}
let hashing = 0;
async function hashPassword(password, salt) {
  if (hashing >= 4) throw Object.assign(new Error('Hệ thống đang bận. Hãy thử lại.'), { status: 503 });
  hashing++;
  try { return await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }
  finally { hashing--; }
}
export async function register(db, { email, name, password }) {
  email = requireVnuEmail(email);
  const salt = randomBytes(16).toString('hex');
  const hash = (await hashPassword(password, salt)).toString('hex');
  const id = `local_${randomUUID()}`;
  try { db.prepare('INSERT INTO users(id,email,name,salt,password_hash,created) VALUES(?,?,?,?,?,?)').run(id, email, name, salt, hash, Date.now()); }
  catch (e) { if (e.code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(e.message)) throw Object.assign(new Error('Không thể tạo tài khoản này. Thử đăng nhập hoặc dùng email khác.'), { status: 409 }); throw e; }
  return db.prepare('SELECT id,email,name,is_admin FROM users WHERE id=?').get(id);
}
export async function authenticate(db, email, password) {
  email = normalizeEmail(email);
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const candidate = await hashPassword(password, user?.salt || 'unregistered-account-dummy-salt');
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(candidate, expected) && accountAllowed(user) ? user : null;
}
export function newSession(db, userId) {
  const token = randomBytes(32).toString('hex'), stamp = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(stamp);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires,created) VALUES(?,?,?,?)').run(digest(token), userId, stamp + 7 * 86400000, stamp);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created DESC LIMIT 10)').run(userId, userId);
  return token;
}
export function sessionUser(db, token) {
  if (!/^[0-9a-f]{64}$/.test(token || '')) return null;
  const user = db.prepare('SELECT u.id,u.email,u.name,u.is_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(digest(token), Date.now());
  return accountAllowed(user) ? user : null;
}
export function consumeAttempt(db, ip, email) {
  const stamp = Date.now();
  // Shared campus NATs must not lock out the entire class after 30 logins.
  // Per-account limits and bounded scrypt concurrency remain enforced.
  for (const [key, limit] of [[`ip:${ip}`, 10000], [`email:${email}`, 10]]) {
    const hashed = digest(key);
    const row = db.prepare('SELECT count,expires FROM attempts WHERE key=?').get(hashed);
    if (row && row.expires > stamp && row.count >= limit) return false;
  }
  for (const key of [`ip:${ip}`, `email:${email}`]) {
    db.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.expires<=? THEN 1 ELSE attempts.count+1 END,expires=CASE WHEN attempts.expires<=? THEN excluded.expires ELSE attempts.expires END').run(digest(key), stamp + 900000, stamp, stamp);
  }
  return true;
}
