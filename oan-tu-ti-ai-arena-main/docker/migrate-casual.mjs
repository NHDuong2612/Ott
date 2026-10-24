import { DatabaseSync, backup } from 'node:sqlite';
import { readdirSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
export async function migrateCasual(directory) {
  mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, 'casual.sqlite');
  const oldDirectory = path.join(directory, 'arena/v3/d1/miniflare-D1DatabaseObject');
  if (!existsSync(destination) && existsSync(oldDirectory)) {
    const files = readdirSync(oldDirectory).filter(file => file.endsWith('.sqlite') && file !== 'metadata.sqlite');
    if (files.length !== 1) throw new Error('Ambiguous old practice databases. Preserve the volume and select a database before migration.');
    const old = new DatabaseSync(path.join(oldDirectory, files[0]), { readOnly: true });
    await backup(old, destination); old.close();
    console.log('Previous Docker practice data copied safely. Original database retained.');
  }
  const db = new DatabaseSync(destination);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS arena_migrations(name TEXT PRIMARY KEY);');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM arena_migrations WHERE name=?').get(file)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(path.join('drizzle', file), 'utf8').replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ').replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS '));
      db.prepare('INSERT INTO arena_migrations(name) VALUES(?)').run(file); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  db.close();
}
