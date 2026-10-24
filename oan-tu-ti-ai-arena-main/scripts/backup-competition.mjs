import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const data = process.env.DATA_DIR || '/data';
const destination = path.resolve(process.argv[2] || path.join(data, 'backups', new Date().toISOString().replaceAll(':', '-')));
mkdirSync(path.dirname(destination), { recursive: true });
mkdirSync(destination, { recursive: false });
for (const file of ['auth.sqlite', 'competition.sqlite', 'casual.sqlite']) {
  const source = path.join(data, file);
  if (!existsSync(source)) throw new Error(`Missing ${file}; backup was not completed.`);
  const db = new DatabaseSync(source);
  await backup(db, path.join(destination, file));
  const check = new DatabaseSync(path.join(destination, file), { readOnly: true });
  if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
  check.close(); db.close();
}
writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: ['auth.sqlite', 'competition.sqlite', 'casual.sqlite'], note: 'Accounts, official competition and casual practice. Copy .secrets separately. Pause judging while making a coordinated backup.' }, null, 2));
console.log(`Backup verified: ${destination}`);
