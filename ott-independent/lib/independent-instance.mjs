// This identifier belongs to the new Ott installation, never to the original site.
export const INSTANCE_ID = 'ott-independent-20261024-6c0827ab';
export const ORIGINAL_ORIGIN = 'https://oan-tu-ti-ai-arena.vercel.app';

export function independentOrigin(value) {
  if (!value) throw new Error('Supply the HTTPS origin of the NEW Ott website.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin === ORIGINAL_ORIGIN) {
    throw new Error('Use the HTTPS origin of the NEW website; the original website is not allowed.');
  }
  return url.origin;
}

export async function assertIndependentDatabase(query) {
  let result;
  try { result = await query('SELECT instance_id FROM ott_instance.identity WHERE singleton = 1'); }
  catch (error) {
    if (error.code === '42P01' || error.code === '3F000') throw new Error('This database has not been initialized for the independent Ott website.');
    throw error;
  }
  if (result.rows.length !== 1 || result.rows[0].instance_id !== INSTANCE_ID) {
    throw new Error('Database belongs to another installation. Refusing to access its data.');
  }
}

// A dedicated client keeps the identity marker and migrations in one transaction.
export async function migrateIndependentDatabase(client, statements) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(2184102026)');
    const marker = await client.query("SELECT to_regclass('ott_instance.identity') AS identity_table");
    if (marker.rows[0].identity_table) {
      await assertIndependentDatabase((text, values) => client.query(text, values));
    } else {
      const occupied = await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') LIMIT 1");
      if (occupied.rows.length) throw new Error('Database is not empty. Create a separate empty database; the existing website must not be migrated.');
      await client.query('CREATE SCHEMA ott_instance');
      await client.query('CREATE TABLE ott_instance.identity (singleton integer PRIMARY KEY CHECK (singleton = 1), instance_id text NOT NULL)');
      await client.query('INSERT INTO ott_instance.identity (singleton, instance_id) VALUES (1, $1)', [INSTANCE_ID]);
    }
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
