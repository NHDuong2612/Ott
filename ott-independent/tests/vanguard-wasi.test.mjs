import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBot, runGame, startBot } from '../judge/runner.mjs';
import { sha, verifyOfficial, RUNTIME_VERSION } from '../competition/store.mjs';
import { ENGINE_VERSION, legalMoves } from '../lib/engine.mjs';
const config = { maxPlies: 200, moveMs: 2000, startupMs: 8000, memoryMB: 128 };
const source = readFileSync(process.env.VANGUARD_SOURCE || 'public/bots/vanguard.py', 'utf8');
const validation = await validateBot({ source, sha: sha(source), config, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION });
assert.equal(validation.valid, true, validation.message);
for (const player of ['P1','P2']) {
  const board=Array.from({length:9},()=>Array(9).fill(null));
  const [x,y,gx,gy]=player==='P1'?[8,1,1,7]:[0,7,7,1];
  board[y][x]={player,type:'ROCK'};board[gy][gx]={player,type:'SCISSORS'};
  const bot=startBot(source,config,2026);
  try { await bot.ready; const move=await bot.move({board,player,turn:0,history:[],legal_moves:legalMoves(board,player)});assert.equal(move.to,player==='P1'?'I1':'A9','Immediate win has priority over opening defense'); }
  finally { bot.close(); }
}
let score = 0;
for (const opponent of ['sprinter', 'guardian', 'tactician']) for (const side of ['p1', 'p2']) {
  const enemy = readFileSync(`public/bots/${opponent}.py`, 'utf8');
  const payload = { config, seed: 2026, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, p1: { source: side === 'p1' ? source : enemy }, p2: { source: side === 'p2' ? source : enemy } };
  for (const seat of ['p1','p2']) payload[seat].sha = sha(payload[seat].source);
  const start = Date.now(), result = await runGame(payload); verifyOfficial(payload, result);
  const seat = side === 'p1' ? 'P1' : 'P2', verdict = !result.winner ? 'draw' : result.winner === seat ? 'win' : 'loss';
  assert.ok(!(['bot_error','timeout','invalid_move','output_limit'].includes(result.reason) && result.faultPlayer === seat), `Vanguard forfeited: ${result.message}`);
  score += verdict === 'win' ? 1 : verdict === 'draw' ? .5 : 0;
  console.log(`Vanguard ${seat} vs ${opponent}: ${verdict}, ${result.moves.length} plies, ${result.reason}, ${Date.now()-start}ms`);
}
console.log(`Vanguard reference score: ${score}/6. No rank is guaranteed in the 100-team tournament.`);
