import assert from 'node:assert/strict';
import {createInitialBoard,legalMoves,applyMove,simulate,verifyReplay} from '../lib/engine.mjs';
import {evaluateCombat,countPlayerPieces,validateMove,createEmptyBoard,checkWinCondition} from '../lib/rules/gameRules.js';
const board=createInitialBoard();
assert.equal(countPlayerPieces(board).P1.total,15);assert.equal(countPlayerPieces(board).P2.total,15);
assert.equal(board[0][8],null);assert.equal(board[8][0],null);
for(const type of ['ROCK','PAPER','SCISSORS'])assert.equal(countPlayerPieces(board).P1[type],5);
assert.throws(()=>applyMove(board,{from:'B8',to:'B5'},'P1'));
assert.throws(()=>applyMove(board,{from:'B1',to:'A1'},'P1'));
for(const m of legalMoves(board,'P1'))assert.equal(validateMove(board,m,'P1').valid,true);
assert.equal(evaluateCombat({type:'ROCK',player:'P1'},{type:'SCISSORS',player:'P2'}),'WIN');
assert.equal(evaluateCombat({type:'ROCK',player:'P1'},{type:'PAPER',player:'P2'}),'LOSE');
const goalBoard=createEmptyBoard();goalBoard[1][8]={type:'ROCK',player:'P1'};applyMove(goalBoard,{from:'I2',to:'I1'},'P1');assert.equal(checkWinCondition(goalBoard,{to:'I1',player:'P1'}).winner,'P1');
for(const a of ['greedy','random'])for(const b of ['greedy','random'])for(const seed of [1,42,100]){const replay=simulate(a,b,seed);assert.equal(verifyReplay(replay),true);assert.deepEqual(replay,simulate(a,b,seed));}
const bad=structuredClone(simulate());bad.moves[0].to='Z9';assert.throws(()=>verifyReplay(bad));
assert.throws(()=>verifyReplay({moves:[],winner:null,reason:'max_plies'}));
console.log('Engine checks passed: placement, captures, goals, illegal moves, replay integrity, deterministic seeds and side-swapped fixtures.');
