import { database } from '../lib/postgres.mjs';
const email=(process.argv[2]||'').trim().toLowerCase();
if(!email)throw new Error('Usage: node --env-file=.env.local scripts/vercel-admin.mjs your@email.com');
const result=await database().prepare('UPDATE auth_users SET is_admin=1 WHERE email=?').bind(email).run();
if(!result.meta.changes)throw new Error('Register the account on the Vercel site first.');
console.log('Account may now claim organizer setup in the app.');
