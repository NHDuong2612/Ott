import assert from 'node:assert/strict';
import { sqlForPostgres } from '../lib/postgres.mjs';
assert.equal(sqlForPostgres('SELECT * FROM rooms WHERE id=? AND revision=?'),'SELECT * FROM rooms WHERE id=$1 AND revision=$2');
assert.equal(sqlForPostgres("SELECT '?' AS literal, 'it''s ?' AS escaped WHERE id=?"),"SELECT '?' AS literal, 'it''s ?' AS escaped WHERE id=$1");
assert.equal(sqlForPostgres("INSERT OR IGNORE INTO settings(key,value) VALUES('admin',?)"),"INSERT INTO settings(key,value) VALUES('admin',$1) ON CONFLICT DO NOTHING");
console.log('Postgres adapter checks passed: parameters, quoted literals and bootstrap conflict handling.');
