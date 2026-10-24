import assert from 'node:assert/strict';
import { INSTANCE_ID, ORIGINAL_ORIGIN, independentOrigin, assertIndependentDatabase, migrateIndependentDatabase } from '../lib/independent-instance.mjs';

for (const origin of [undefined, ORIGINAL_ORIGIN, ORIGINAL_ORIGIN + '/', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?token=x']) {
  assert.throws(() => independentOrigin(origin));
}
assert.equal(independentOrigin('https://ott-new.example.com/'), 'https://ott-new.example.com');
await assertIndependentDatabase(async () => ({ rows: [{ instance_id: INSTANCE_ID }] }));
for (const rows of [[], [{ instance_id: 'original-website' }]]) {
  await assert.rejects(() => assertIndependentDatabase(async () => ({ rows })), /another installation/);
}
await assert.rejects(() => assertIndependentDatabase(async () => { throw Object.assign(new Error('missing'), { code: '42P01' }); }), /not been initialized/);

function fakeClient({ occupied = false, identity = null, failMigration = false } = {}) {
  const calls = [];
  return { calls, async query(text, values) {
    calls.push({ text, values });
    if (text.includes('to_regclass')) return { rows: [{ identity_table: identity ? 'ott_instance.identity' : null }] };
    if (text.includes('information_schema.tables')) return { rows: occupied ? [{ exists: 1 }] : [] };
    if (text.startsWith('SELECT instance_id')) return { rows: [{ instance_id: identity }] };
    if (text === 'MIGRATION' && failMigration) throw new Error('migration failed');
    return { rows: [] };
  } };
}
const old = fakeClient({ occupied: true });
await assert.rejects(() => migrateIndependentDatabase(old, ['MIGRATION']), /not empty/);
assert.equal(old.calls.at(-1).text, 'ROLLBACK');
assert.ok(old.calls.every(call => !/^(CREATE|INSERT|MIGRATION|COMMIT)/.test(call.text)), 'Old database gets no DDL or data writes');
const foreign = fakeClient({ identity: 'other-installation' });
await assert.rejects(() => migrateIndependentDatabase(foreign, ['MIGRATION']), /another installation/);
assert.ok(!foreign.calls.some(call => call.text === 'MIGRATION'));
const fresh = fakeClient();
await migrateIndependentDatabase(fresh, ['MIGRATION']);
assert.equal(fresh.calls.at(-1).text, 'COMMIT');
assert.deepEqual(fresh.calls.find(call => call.text.startsWith('INSERT')).values, [INSTANCE_ID]);
const redeploy = fakeClient({ identity: INSTANCE_ID });
await migrateIndependentDatabase(redeploy, ['MIGRATION']);
assert.equal(redeploy.calls.at(-1).text, 'COMMIT');
assert.ok(!redeploy.calls.some(call => call.text.startsWith('CREATE')));
const failure = fakeClient({ failMigration: true });
await assert.rejects(() => migrateIndependentDatabase(failure, ['MIGRATION']), /migration failed/);
assert.equal(failure.calls.at(-1).text, 'ROLLBACK');
assert.ok(!failure.calls.some(call => call.text === 'COMMIT'));
console.log('Independent installation checks passed: old URL blocked, old/foreign database refused before writes, fresh initialization, redeployment, and rollback.');
