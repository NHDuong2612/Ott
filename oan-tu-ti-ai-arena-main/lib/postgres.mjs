import { neon } from '@neondatabase/serverless';
import pg from 'pg';
import { readFileSync } from 'node:fs';

export const nativePostgres = () => process.env.DATABASE_DRIVER === 'pg';
export function connectionString(value) {
  const url = value || (process.env.DATABASE_URL_FILE ? readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim() : process.env.DATABASE_URL);
  if (!url) throw new Error('DATABASE_URL or DATABASE_URL_FILE is required.');
  return url;
}
const poolKey = Symbol.for('uet.arena.postgres.pools');
const pools = globalThis[poolKey] ||= new Map();
export function postgresPool(value) {
  const url = connectionString(value);
  if (!pools.has(url)) {
    const max = Math.max(2, Math.min(64, Number(process.env.PG_POOL_MAX) || 20));
    const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
    pool.on('error', () => console.error('An idle database connection was lost; the pool will reconnect.'));
    pools.set(url, pool);
  }
  return pools.get(url);
}
export async function closePostgresPools() {
  const active = [...pools.values()]; pools.clear();
  await Promise.all(active.map(pool => pool.end()));
}

export function sqlForPostgres(input) {
  let index = 0;
  let text = input.replace(/('[^']*(?:''[^']*)*'|"[^"]*"|\?)/g, token => token === '?' ? `$${++index}` : token);
  if (/^INSERT OR IGNORE /i.test(text)) text = text.replace(/^INSERT OR IGNORE /i, 'INSERT ') + ' ON CONFLICT DO NOTHING';
  return text;
}
export function database(value) {
  const url = connectionString(value), sql = nativePostgres() ? null : neon(url);
  const query = async (text, values = []) => {
    const result = sql ? await sql.query(sqlForPostgres(text), values, { fullResults: true }) : await postgresPool(url).query(sqlForPostgres(text), values);
    const integers = (result.fields || []).filter(field => field.dataTypeID === 20).map(field => field.name);
    if (integers.length) result.rows = result.rows.map(row => ({ ...row, ...Object.fromEntries(integers.map(key => [key, row[key] === null ? null : Number(row[key])])) }));
    return result;
  };
  return {
    query,
    async transaction(statements) {
      if (sql) return sql.transaction(statements.map(text => sql.query(text)));
      const client = await postgresPool(url).connect();
      try {
        await client.query('BEGIN');
        const results=[]; for(const text of statements) results.push(await client.query(text));
        await client.query('COMMIT'); return results;
      } catch(error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    prepare(text) {
      const statement = values => ({
        bind(...next) { return statement(next); },
        async first() { return (await query(text, values)).rows[0] || null; },
        async all() { return { results: (await query(text, values)).rows }; },
        async run() { return { meta: { changes: (await query(text, values)).rowCount || 0 } }; },
      });
      return statement([]);
    },
  };
}
