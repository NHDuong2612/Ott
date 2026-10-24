import { openStore } from './auth-store.mjs';
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) throw new Error('Usage: docker compose exec app node docker/admin.mjs your@email.com');
const db = openStore(process.env.DATA_DIR || '/data');
const result = db.prepare('UPDATE users SET is_admin=1 WHERE email=?').run(email);
db.close();
if (!result.changes) throw new Error('Register this account in the app first.');
console.log('Account can now claim organizer setup in the app.');
