export const STARTER=`"""Oẳn Tù Tì 2.0 — Greedy starter bot.
state: board, player, legal_moves, turn, history.
Return one legal move: {"from": "B8", "to": "B7"}.
"""

def choose_move(state):
    goal = (8, 0) if state["player"] == "P1" else (0, 8)

    def score(move):
        x = ord(move["to"][0]) - ord("A")
        y = int(move["to"][1]) - 1
        target = state["board"][y][x]
        distance = max(abs(x - goal[0]), abs(y - goal[1]))
        return (8 if target else 0) - distance * 5

    return max(state["legal_moves"], key=score)
`;
export function runPython(code:string,opponent:string,onReady:()=>void):{promise:Promise<any>,cancel:()=>void}{
  const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.src=process.env.NEXT_PUBLIC_LOCAL_RUNTIME==='1'?'/api/sandbox?kind=runner':'/sandbox/runner.html';frame.hidden=true;frame.setAttribute('aria-hidden','true');
  const runId=crypto.randomUUID();let rejectRun:(e:Error)=>void=()=>{};let watchdog:ReturnType<typeof setTimeout>;
  const cleanup=()=>{clearTimeout(watchdog);window.removeEventListener('message',receive);frame.remove();};
  let resolveRun:(r:any)=>void=()=>{};
  const receive=(event:MessageEvent)=>{
    if(event.source!==frame.contentWindow||event.data?.runId!==runId)return;
    if(event.data.type==='ready'){onReady();return;}
    if(event.data.type==='result'){cleanup();resolveRun(event.data.replay);}
    if(event.data.type==='error'){cleanup();rejectRun(new Error(event.data.error));}
  };
  const promise=new Promise<any>((resolve,reject)=>{
    resolveRun=resolve;rejectRun=reject;window.addEventListener('message',receive);
    frame.onload=()=>frame.contentWindow?.postMessage({type:'run',runId,code,opponent},'*');
    watchdog=setTimeout(()=>{cleanup();reject(new Error('Python runner không phản hồi. Hãy thử lại.'));},110000);
    document.body.appendChild(frame);
  });
  return {promise,cancel:()=>{cleanup();rejectRun(new Error('Đã dừng chạy bot.'));}};
}
