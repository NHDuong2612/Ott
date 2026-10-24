import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrateIndependentDatabase } from '../lib/independent-instance.mjs';
if (process.env.ARENA_DEPLOYMENT !== 'local-postgres' || process.env.DATABASE_DRIVER !== 'pg') throw new Error('Local PostgreSQL deployment configuration is required.');
const url = (await readFile(process.env.DATABASE_URL_FILE, 'utf8')).trim();
// Never fall back to a cloud URL accidentally inherited from a developer shell.
if (new URL(url).hostname !== 'db') throw new Error('Local deployment must connect to its db service.');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  const statements = [];
  for (const file of ['vercel-schema.sql', 'competition-schema.sql']) statements.push(await readFile(new URL('../deploy/'+file, import.meta.url), 'utf8'));
  await migrateIndependentDatabase(client, statements);
}
finally { await client.end(); }
console.log('Local PostgreSQL schema ready; starting the arena.');
await import('../server.js');
