import { DatabaseSync } from 'node:sqlite';
import { readdirSync, chownSync, copyFileSync, constants } from 'node:fs';
// Restore only into a NEW empty volume. The original live volume is never overwritten.
if (readdirSync('/data').length) throw new Error('Target volume must be empty. Choose a new volume; preserve the current one.');
for (const name of ['auth.sqlite', 'competition.sqlite', 'casual.sqlite']) {
  // These are finished SQLite backup snapshots, not live database/WAL files.
  // Open the copy read-write: read-only WAL sources cannot acquire sidecar locks.
  copyFileSync('/restore/' + name, '/data/' + name, constants.COPYFILE_EXCL);
  const db = new DatabaseSync('/data/' + name);
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup failed integrity check: ' + name);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
  chownSync('/data/' + name, 1000, 1000);
}
chownSync('/data', 1000, 1000);
console.log('Verified restore into empty volume. Select it using ARENA_DATA_VOLUME. Original volume preserved.');
