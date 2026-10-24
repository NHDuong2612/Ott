import { readFile } from 'node:fs/promises';
import pg from 'pg';
if (process.env.ARENA_DEPLOYMENT !== 'local-postgres' || process.env.DATABASE_DRIVER !== 'pg') throw new Error('Local PostgreSQL deployment configuration is required.');
const url = (await readFile(process.env.DATABASE_URL_FILE, 'utf8')).trim();
// Never fall back to a cloud URL accidentally inherited from a developer shell.
if (new URL(url).hostname !== 'db') throw new Error('Local deployment must connect to its db service.');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(2184102026)');
  for (const file of ['vercel-schema.sql', 'competition-schema.sql']) await client.query(await readFile(new URL('../deploy/'+file, import.meta.url), 'utf8'));
  await client.query('COMMIT');
} catch(error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
console.log('Local PostgreSQL schema ready; starting the arena.');
await import('../server.js');
