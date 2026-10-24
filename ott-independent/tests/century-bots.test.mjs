import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { opponent } from '../scripts/century-bots.mjs';
const bots=Array.from({length:99},(_,i)=>opponent(i));
assert.equal(new Set(bots.map(b=>b.name)).size,99);
assert.equal(new Set(bots.map(b=>createHash('sha256').update(b.source).digest('hex'))).size,99);
const counts=bots.reduce((a,b)=>{a[b.family]=(a[b.family]||0)+1;return a;},{});
assert.equal(Object.keys(counts).length,11);assert.ok(Object.values(counts).every(n=>n===9));
for(const [i,bot] of bots.entries()) {
  assert.ok(Buffer.byteLength(bot.source)<65536);
  assert.equal(bot.source,opponent(i).source,'Population must be reproducible');
  assert.ok(bot.source.includes('def choose_move(state):'));
  assert.ok(!bot.source.includes('JUDGE_TOKEN'));
}
console.log('99 unique reproducible bot sources: 11 strategy families × 9 parameter variants; all within the submission limit.');
