import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createInitialBoard, legalMoves, applyMove, referenceMove, verifyReplay } from '../lib/engine.mjs';

const script = `import sys,json,runpy,copy,time
choose=runpy.run_path(sys.argv[1])['choose_move']
for line in sys.stdin:
    state=json.loads(line); before=copy.deepcopy(state); start=time.perf_counter()
    move=choose(state); elapsed=time.perf_counter()-start
    assert state==before, 'Bot mutated its input'
    assert move in [{'from':m['from'],'to':m['to']} for m in state['legal_moves']], move
    print(json.dumps({'move':move,'seconds':elapsed}),flush=True)
`;
let total=0,slowest=0;
for(const name of ['sprinter','guardian','tactician']) {
  const child=spawn(process.env.OTT_PYTHON||'python',['-u','-c',script,`public/bots/${name}.py`],{stdio:['pipe','pipe','pipe']});
  const lines=createInterface({input:child.stdout});let pending,stderr='';
  child.stderr.on('data',d=>stderr+=d);
  lines.on('line',line=>{if(pending){const resolve=pending;pending=null;resolve(JSON.parse(line));}});
  child.on('exit',()=>{if(pending){const resolve=pending;pending=null;resolve({error:stderr||'Bot exited'});}});
  async function choose(state){
    const response=await new Promise((resolve,reject)=>{pending=resolve;child.stdin.write(JSON.stringify(state)+'\n');const timeout=setTimeout(()=>{pending=null;child.kill();reject(new Error(`${name} exceeded 2 seconds`));},2000);const original=pending;pending=data=>{clearTimeout(timeout);original(data);};});
    assert.ok(!response.error,response.error);slowest=Math.max(slowest,response.seconds);return response.move;
  }
  try {
    for(const player of ['P1','P2']) {
      const board=Array.from({length:9},()=>Array(9).fill(null));
      const [x,y]=player==='P1'?[8,1]:[0,7];board[y][x]={player,type:'ROCK'};
      const move=await choose({board,player,legal_moves:legalMoves(board,player),history:[],turn:0});
      assert.equal(move.to,player==='P1'?'I1':'A9',`${name} must take an immediate win`);
    }
    if(name==='tactician'){
      const board=Array.from({length:9},()=>Array(9).fill(null));
      board[7][0]={player:'P2',type:'SCISSORS'};board[6][1]={player:'P1',type:'ROCK'};
      const move=await choose({board,player:'P1',legal_moves:legalMoves(board,'P1'),history:[],turn:0});
      assert.deepEqual(move,{from:'B7',to:'A8'},'Tactician must stop an immediate goal threat');
    }
    for(const strategy of ['greedy','random'])for(const botSide of ['P1','P2']){
      const board=createInitialBoard(),moves=[];let winner=null,reason='max_plies';
      for(let ply=0;ply<200;ply++){
        const player=ply%2?'P2':'P1',options=legalMoves(board,player);
        if(!options.length){winner=player==='P1'?'P2':'P1';reason='no_moves';break;}
        const move=player===botSide?await choose({board,player,legal_moves:options,turn:ply,history:moves}):referenceMove(board,player,strategy,42+ply*37);
        const step=applyMove(board,move,player);moves.push(step);
        if(step.winner){winner=step.winner;reason='goal';break;}
      }
      verifyReplay({moves,winner,reason});total++;
      console.log(`${name} ${botSide} vs ${strategy}: ${winner===botSide?'win':winner?'loss':'draw'}, ${moves.length} plies`);
    }
  }finally{child.stdin.end();lines.close();}
}
console.log(`${total} complete games verified by the original JS rules; inputs unchanged; immediate wins checked on both sides. Slowest Python call: ${(slowest*1000).toFixed(1)}ms.`);
