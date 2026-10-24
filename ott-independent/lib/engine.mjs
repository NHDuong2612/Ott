import { createInitialBoard, validateMove, coordToPos, posToCoord, getValidMovesForPiece, checkWinCondition } from './rules/gameRules.js';
export { createInitialBoard };
export const ENGINE_VERSION = 'ott-board-1.0';
export const MAX_PLIES = 200;
export function legalMoves(board, player) {
  const result = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    for (const m of getValidMovesForPiece(board, x, y, player)) result.push({from:posToCoord(x,y),to:m.coord,player,capture:m.isCapture});
  }
  return result;
}
export function applyMove(board, move, player) {
  if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') throw new Error('Bot phải trả về {"from": "A8", "to": "A7"}.');
  const action = {from:move.from,to:move.to,player};
  const check = validateMove(board,action,player);
  if (!check.valid) throw new Error(check.reason);
  const a=coordToPos(action.from), b=coordToPos(action.to);
  const capture = board[b.y][b.x];
  board[b.y][b.x]=board[a.y][a.x]; board[a.y][a.x]=null;
  return {...action,capture:capture?.type??null,winner:checkWinCondition(board,action).winner};
}
export function referenceMove(board,player,strategy='greedy',seed=1) {
  const moves=legalMoves(board,player); if (!moves.length) return null;
  if(strategy==='random') return moves[((seed*1664525+1013904223)>>>0)%moves.length];
  const goal=player==='P1'?{x:8,y:0}:{x:0,y:8};
  const score=m=>{const a=coordToPos(m.from),b=coordToPos(m.to);return (Math.max(Math.abs(a.x-goal.x),Math.abs(a.y-goal.y))-Math.max(Math.abs(b.x-goal.x),Math.abs(b.y-goal.y)))*5+(m.capture?8:0)+((b.x===goal.x&&b.y===goal.y)?1000:0);};
  return moves.reduce((best,m)=>score(m)>score(best)?m:best,moves[seed%moves.length]);
}
export function simulate(a='greedy',b='random',seed=42) {
  const board=createInitialBoard(), moves=[]; let winner=null,reason='max_plies';
  for(let i=0;i<MAX_PLIES;i++) {
    const player=i%2?'P2':'P1';
    const move=referenceMove(board,player,player==='P1'?a:b,seed+i*37);
    if(!move) {winner=player==='P1'?'P2':'P1';reason='no_moves';break;}
    const step=applyMove(board,move,player); moves.push(step); if(step.winner){winner=step.winner;reason='goal';break;}
  }
  return {moves,winner,reason,seed,engine:ENGINE_VERSION};
}
export function verifyReplay(replay) {
  if (!replay || !Array.isArray(replay.moves) || replay.moves.length>MAX_PLIES) throw new Error('Replay không hợp lệ.');
  const board=createInitialBoard(); let winner=null;
  for(let i=0;i<replay.moves.length;i++) {if(winner) throw new Error('Trận đã kết thúc.'); const m=applyMove(board,replay.moves[i],i%2?'P2':'P1'); winner=m.winner;}
  if(replay.reason==='error'||replay.reason==='timeout') winner=replay.moves.length%2?'P1':'P2';
  if(replay.reason==='no_moves') {const p=replay.moves.length%2?'P2':'P1';if(legalMoves(board,p).length)throw new Error('Vẫn còn nước đi hợp lệ.');winner=p==='P1'?'P2':'P1';}
  if(winner!==replay.winner) throw new Error('Kết quả không khớp với replay.');
  if(!winner&&replay.moves.length!==MAX_PLIES) throw new Error('Replay chưa hoàn tất.');
  return true;
}
