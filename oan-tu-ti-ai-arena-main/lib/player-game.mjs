import { createInitialBoard,applyMove,legalMoves,MAX_PLIES,ENGINE_VERSION } from './engine.mjs';

export function newGame(){return {board:createInitialBoard(),moves:[],turn:'P1',status:'playing',winner:null,reason:null,engine:ENGINE_VERSION};}
export function playTurn(game,move){
  if(game.status!=='playing')throw new Error('Ván đấu đã kết thúc.');
  const board=structuredClone(game.board);
  const step=applyMove(board,move,game.turn);
  const moves=[...game.moves,step],turn=game.turn==='P1'?'P2':'P1';
  let winner=step.winner,reason=winner?'goal':null;
  if(!winner&&moves.length>=MAX_PLIES)reason='max_plies';
  if(!reason&&!legalMoves(board,turn).length){winner=game.turn;reason='no_moves';}
  return {board,moves,turn,winner,reason,status:reason?'finished':'playing',engine:ENGINE_VERSION};
}
export function replayGame(moves){
  if(!Array.isArray(moves)||moves.length>MAX_PLIES)throw new Error('Danh sách nước đi không hợp lệ.');
  return moves.reduce((game,move)=>playTurn(game,move),newGame());
}
export function botState(game){return {board:structuredClone(game.board),player:game.turn,legal_moves:legalMoves(game.board,game.turn).map(({from,to})=>({from,to})),turn:game.moves.length,history:structuredClone(game.moves)};}
