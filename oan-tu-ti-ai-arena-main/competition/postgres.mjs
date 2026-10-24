import { Client, neonConfig } from '@neondatabase/serverless';
import { sqlForPostgres, nativePostgres, postgresPool, connectionString as configuredConnection } from '../lib/postgres.mjs';

neonConfig.webSocketConstructor = globalThis.WebSocket;

// Only SQL tokens are rewritten; quoted values remain untouched and all inputs bind.
export function competitionSql(text) {
  return sqlForPostgres(text).replace(/'(?:[^']|'')*'|\buser\b|\buntil\b/g, token => token.startsWith("'") ? token : `"${token}"`);
}
function normalize(row, fields) {
  if (!row) return undefined;
  const numbers = new Set(fields.filter(field => field.dataTypeID === 20).map(field => field.name));
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numbers.has(key) && value !== null ? Number(value) : value]));
}
export async function withCompetition(fn, { write = false, submission, connectionString, schema = 'arena_competition' } = {}) {
  connectionString = configuredConnection(connectionString);
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Invalid database schema.');
  const native = nativePostgres();
  const client = native ? await postgresPool(connectionString).connect() : new Client({ connectionString, connectionTimeoutMillis: 10000 });
  let begun = false;
  try {
    if (!native) await client.connect();
    await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); begun = true;
    await client.query(`SET LOCAL search_path TO ${schema},public`);
    await client.query("SET LOCAL statement_timeout='45000'; SET LOCAL lock_timeout='8000'");
    if (submission && (!write || typeof submission.event !== 'string' || typeof submission.user !== 'string')) throw new Error('Invalid submission transaction.');
    // Submissions share the control lock, then serialize only their own team.
    // Exclusive control writes (freeze/revoke/results/leases) still fence every
    // submission, including during rolling deployments of the old adapter.
    // ponytail: control writes remain serialized; shard these after measuring worker contention.
    if (write) await client.query(submission ? 'SELECT pg_advisory_xact_lock_shared(hashtext($1))' : 'SELECT pg_advisory_xact_lock(hashtext($1))', [schema]);
    if (submission) await client.query('SELECT t.id FROM members m JOIN teams t ON t.id=m.team WHERE m.event=$1 AND m."user"=$2 FOR UPDATE OF t', [submission.event, submission.user]);
    let batching = false;
    const inserts = new Map();
    async function flush() {
      for (const [prefix, rows] of inserts) for (let start = 0; start < rows.length; start += 200) {
        const chunk = rows.slice(start, start + 200), values = [];
        const tuples = chunk.map(row => '(' + row.map(value => { values.push(value); return '$' + values.length; }).join(',') + ')');
        await client.query(competitionSql(prefix + ' VALUES ' + tuples.join(',')), values);
      }
      inserts.clear();
    }
    const db = {
      transaction: callback => callback(), // The entire request already owns one DB transaction.
      async batch(callback) {
        if (!write || batching) throw new Error('Batch requires a writable root transaction.');
        batching = true;
        try { const result = await callback(); await flush(); return result; }
        finally { batching = false; inserts.clear(); }
      },
      prepare(sql) {
        const query = async values => { await flush(); return client.query(competitionSql(sql), values); };
        return {
          async get(...values) { const r = await query(values); return normalize(r.rows[0], r.fields); },
          async all(...values) { const r = await query(values); return r.rows.map(row => normalize(row, r.fields)); },
          async run(...values) {
            // Freeze emits entries, series, games and jobs in FK dependency order.
            // Group matching INSERTs into bounded statements instead of one network hop per row.
            const insert = batching && sql.match(/^(INSERT INTO \w+\([\w,]+\)) VALUES\((\?(?:,\?)*)\)$/i);
            if (insert) {
              const rows = inserts.get(insert[1]) || []; rows.push(values); inserts.set(insert[1], rows);
              return { changes: 1 }; // Any constraint error still rolls back the whole transaction.
            }
            return { changes: (await query(values)).rowCount || 0 };
          },
        };
      },
    };
    const result = await fn(db);
    await client.query('COMMIT'); begun = false;
    return result;
  } catch (error) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { if (native) client.release(); else await client.end().catch(() => {}); }
}
