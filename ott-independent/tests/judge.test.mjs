import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBot, runGame } from '../judge/runner.mjs';
import { sha, verifyOfficial, RUNTIME_VERSION } from '../competition/store.mjs';
import { ENGINE_VERSION } from '../lib/engine.mjs';
const config = { memoryMB: 128, startupMs: 10000, moveMs: 2000, maxPlies: 40 };
const source = 'def choose_move(state):\n    return state["legal_moves"][0]\n';
const payload = code => ({ source: code, sha: sha(code), config, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION });
for (const file of ['sprinter', 'guardian', 'tactician']) {
  const r = await validateBot(payload(readFileSync(`public/bots/${file}.py`, 'utf8')));
  assert.equal(r.valid, true, `${file}: ${r.message}`);
}
const blocked = [
  'open("/etc/passwd").read()\n' + source,
  'open("/lib/escape.py","w").write("harmful")\n' + source,
  'import os\nos.system("echo escaped")\n' + source,
  'import socket\nsocket.socket().connect(("1.1.1.1",80))\n' + source,
  'import os\nassert os.environ.get("JUDGE_TOKEN") is not None\n' + source,
  'while True: pass\n' + source,
  'x=bytearray(512*1024*1024)\n' + source,
  'print("X"*100000)\n' + source,
  'def choose_move(state):\n    return {"from":"A1","to":"I9"}\n',
];
for (const code of blocked) { const r = await validateBot(payload(code)); assert.equal(r.valid, false, 'Harmful/invalid sample must not validate'); }
const p = { config, seed: 42, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, p1: { source, sha: sha(source) }, p2: { source, sha: sha(source) } };
const game = await runGame(p); verifyOfficial(p, game);
const bad = 'def choose_move(state):\n    while True: pass\n';
const timeoutPayload = { ...p, config: { ...config, moveMs: 200 }, p2: { source: bad, sha: sha(bad) } };
const timed = await runGame(timeoutPayload); assert.equal(timed.winner, 'P1'); assert.equal(timed.reason, 'timeout'); verifyOfficial(timeoutPayload, timed);
console.log('Real WASI judge passed: all sample bots, full game, timeout forfeit, no host files, read-only stdlib, no subprocess/network/secrets, bounded memory and output.');
