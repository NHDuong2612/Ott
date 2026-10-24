import { readFile } from 'node:fs/promises';
import { Client, neonConfig } from '@neondatabase/serverless';
import { migrateIndependentDatabase } from '../lib/independent-instance.mjs';
if (!process.env.DATABASE_URL) throw new Error('Connect a NEW empty Neon database to this independent Vercel project (DATABASE_URL is required).');
neonConfig.webSocketConstructor = globalThis.WebSocket;
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  const statements = [];
  for (const file of ['vercel-schema.sql', 'competition-schema.sql']) {
    statements.push(...(await readFile(new URL('../deploy/' + file, import.meta.url), 'utf8')).split(';').map(s => s.trim()).filter(Boolean));
  }
  await migrateIndependentDatabase(client, statements);
  console.log('Independent Ott database ready. Migrations are restricted to this installation.');
} finally { await client.end(); }
