import assert from 'node:assert/strict';
import {newGame,playTurn,replayGame,botState} from '../lib/player-game.mjs';
import {legalMoves,referenceMove} from '../lib/engine.mjs';
import {createEmptyBoard} from '../lib/rules/gameRules.js';

const original=newGame(),first=playTurn(original,{from:'B8',to:'B7'});
assert.equal(first.turn,'P2');assert.equal(original.board[7][1].player,'P1');assert.equal(original.moves.length,0);
assert.equal(first.board[6][1].player,'P1');assert.equal(first.moves.length,1);
assert.throws(()=>playTurn(first,{from:'B7',to:'B6'}));
assert.throws(()=>playTurn(original,{from:'B8',to:'B5'}));
const state=botState(first);assert.equal(state.player,'P2');assert.ok(state.legal_moves.length);
state.board[0][1]=null;state.history[0].to='Z9';assert.ok(first.board[0][1]);assert.equal(first.moves[0].to,'B7');
assert.deepEqual(replayGame(first.moves),first);
for(const humanSide of ['P1','P2']){
  let game=newGame();
  while(game.status==='playing'){
    const move=game.turn===humanSide?legalMoves(game.board,game.turn)[0]:referenceMove(game.board,game.turn,'greedy',42+game.moves.length);
    game=playTurn(game,move);
  }
  assert.ok(game.moves.length<=200);assert.deepEqual(replayGame(game.moves),game);
  assert.throws(()=>playTurn(game,{from:'A1',to:'A2'}));
}
const goal=newGame();goal.board=createEmptyBoard();goal.board[1][8]={player:'P1',type:'ROCK'};goal.board[8][7]={player:'P2',type:'PAPER'};
const win=playTurn(goal,{from:'I2',to:'I1'});assert.equal(win.winner,'P1');assert.equal(win.reason,'goal');
const draw=newGame();draw.board=createEmptyBoard();draw.board[3][3]={player:'P1',type:'ROCK'};draw.board[6][6]={player:'P2',type:'PAPER'};draw.moves=Array(199).fill({});
const tied=playTurn(draw,{from:'D4',to:'D5'});assert.equal(tied.status,'finished');assert.equal(tied.reason,'max_plies');assert.equal(tied.winner,null);
console.log('Human play checks passed: immutable moves, turns, legal-move validation, both human sides, replay/undo, goals, draw limit and bot-state isolation.');
