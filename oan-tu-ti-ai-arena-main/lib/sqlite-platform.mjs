import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
let connection;
export function localDatabase() {
  if (!connection) {
    const directory = process.env.DATA_DIR || '/data';
    mkdirSync(directory, { recursive: true });
    connection = new DatabaseSync(path.join(directory, 'casual.sqlite'));
    connection.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  }
  return { prepare(sql) {
    const stmt = connection.prepare(sql);
    const statement = values => ({
      bind(...next) { return statement(next); },
      async first() { return stmt.get(...values) || null; },
      async all() { return { results: stmt.all(...values) }; },
      async run() { return { meta: { changes: Number(stmt.run(...values).changes) } }; },
    });
    return statement([]);
  } };
}
