'use client';
import { useEffect,useRef,useState } from 'react';
import { ArrowRight,ArrowUpRight,Bot,Check,Copy,Download,Flag,Gamepad2,Hand,Hexagon,Info,Link,LoaderCircle,LogIn,Plus,RotateCcw,Scissors,Undo2,Users,X } from 'lucide-react';
import { legalMoves,referenceMove } from '../lib/engine.mjs';
import { newGame,playTurn,replayGame,botState } from '../lib/player-game.mjs';
import { createPythonPlayer } from '../lib/python-player';
import { BOT_EXAMPLES } from '../lib/bot-examples';

const MODES=[{id:'local',label:'Chơi tự do',icon:Gamepad2},{id:'computer',label:'Đấu với máy',icon:Bot},{id:'python',label:'Đấu bot của tôi',icon:Scissors},{id:'friend',label:'1v1 với bạn',icon:Users}];
const PIECES:Record<string,string>={ROCK:'Đấm',PAPER:'Lá',SCISSORS:'Kéo'};
function Piece({type}:{type:string}){const Icon=type==='ROCK'?Hexagon:type==='PAPER'?Hand:Scissors;return <Icon size={22} strokeWidth={1.8}/>;}
function gameMessage(game:any){
  if(game.reason==='closed')return 'Phòng đã đóng.';
  if(game.reason==='max_plies')return 'Hòa sau 200 nước đi.';
  if(game.reason==='resign')return `${game.winner} thắng. Đối thủ đã đầu hàng.`;
  if(game.reason==='bot_error')return `${game.winner} thắng vì bot gặp lỗi.`;
  if(game.reason==='no_moves')return `${game.winner} thắng. Đối thủ không còn nước đi.`;
  return `${game.winner} đã chạm đích ${game.winner==='P1'?'I1':'A9'}.`;
}
function PlayBoard({game,selected,onCell,enabled,flipped}:{game:any,selected:string|null,onCell:(coord:string)=>void,enabled:boolean,flipped:boolean}){
  const [focus,setFocus]=useState(0);const cells=useRef<(HTMLButtonElement|null)[]>([]);
  const indices=flipped?[8,7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7,8];
  const targets=selected?new Set(legalMoves(game.board,game.turn).filter((m:any)=>m.from===selected).map((m:any)=>m.to)):new Set();
  const last=game.moves[game.moves.length-1];
  function keyboard(event:React.KeyboardEvent,index:number){
    let next=index;
    if(event.key==='ArrowRight')next=Math.min(80,index+1);
    else if(event.key==='ArrowLeft')next=Math.max(0,index-1);
    else if(event.key==='ArrowDown')next=Math.min(80,index+9);
    else if(event.key==='ArrowUp')next=Math.max(0,index-9);
    else if(event.key==='Home')next=Math.floor(index/9)*9;
    else if(event.key==='End')next=Math.floor(index/9)*9+8;
    else return;
    event.preventDefault();setFocus(next);cells.current[next]?.focus();
  }
  return <div className="board-wrap large human-board"><div className="board-cols"><span/>{indices.map(x=><span key={x}>{String.fromCharCode(65+x)}</span>)}</div><div className="board-body"><div className="board-rows">{indices.map(y=><span key={y}>{y+1}</span>)}</div><div className="board" role="grid" aria-label={`Bàn cờ tương tác 9 nhân 9. Lượt ${game.turn}.`} aria-rowcount={9} aria-colcount={9}>
    {indices.map((y,ri)=><div role="row" className="human-board-row" key={y}>{indices.map((x,ci)=>{
      const coord=String.fromCharCode(65+x)+(y+1),piece=game.board[y][x],target=targets.has(coord),index=ri*9+ci;
      const label=`${coord}, ${piece?`quân ${PIECES[piece.type]} của ${piece.player}`:'ô trống'}${target?', nước đi hợp lệ':''}${coord==='I1'?', đích P1':coord==='A9'?', đích P2':''}`;
      return <button key={coord} ref={el=>{cells.current[index]=el;}} role="gridcell" aria-rowindex={ri+1} aria-colindex={ci+1} aria-label={label} title={label} aria-selected={selected===coord} aria-disabled={!enabled} tabIndex={focus===index?0:-1} onFocus={()=>setFocus(index)} onKeyDown={e=>keyboard(e,index)} onClick={()=>onCell(coord)} className={`cell ${(x+y)%2?'shade':''} ${coord==='A9'||coord==='I1'?'goal':''} ${last?.to===coord?'last':''} ${last?.from===coord?'previous':''} ${selected===coord?'selected-cell':''} ${target?'legal-cell':''}`}>
        {piece?<span className={`piece ${piece.player==='P1'?'p1':'p2'}`}><Piece type={piece.type}/></span>:coord==='A9'||coord==='I1'?<Flag size={18}/>:null}{target?<span className={piece?'capture-ring':'move-dot'}/>:null}
      </button>;
    })}</div>)}
  </div></div></div>;
}
export default function PlayGame({bots,draft,user,onEdit}:{bots:any[],draft:string,user:{id:string,name:string}|null,onEdit:()=>void}){
  const [mode,setMode]=useState('local'),[game,setGame]=useState<any>(newGame),[started,setStarted]=useState(true),[selected,setSelected]=useState<string|null>(null);
  const [side,setSide]=useState('P1'),[strategy,setStrategy]=useState('greedy'),[botId,setBotId]=useState('draft'),[flipped,setFlipped]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [room,setRoom]=useState<any>(null),[roomInput,setRoomInput]=useState(''),[copied,setCopied]=useState(false),[onlineError,setOnlineError]=useState('');
  const player=useRef<ReturnType<typeof createPythonPlayer>|null>(null),epoch=useRef(0);
  const bot=bots.find(b=>b.id===botId),pythonName=bot?.name||BOT_EXAMPLES.find(b=>`example:${b.id}`===botId)?.name||'Bot Python bản nháp';
  const current=mode==='friend'&&room?room.game:game;
  const canPlay=mode==='friend'?room?.status==='playing'&&room.role===current.turn&&!busy:started&&current.status==='playing'&&!busy&&(mode==='local'||current.turn===side);
  const isFriend=mode==='friend',isPython=mode==='python';
  const invite=room&&typeof window!=='undefined'?`${window.location.origin}/?play=1&room=${room.id}`:'';
  function cancel(){epoch.current++;player.current?.dispose();player.current=null;setBusy(false);setSelected(null);setMessage('');}
  useEffect(()=>()=>{epoch.current++;player.current?.dispose();},[]);
  function acceptRoom(next:any){setRoom((old:any)=>!old||old.id!==next.id||next.revision>=old.revision?next:old);setOnlineError('');}
  async function loadRoom(id:string){
    const version=epoch.current;setBusy(true);setError('');
    try{const response=await fetch(`/api/rooms?room=${encodeURIComponent(id)}`);const data:any=await response.json();if(!response.ok)throw new Error(data.error);if(version===epoch.current)acceptRoom(data);}
    catch(e){if(version===epoch.current)setError((e as Error).message);}finally{if(version===epoch.current)setBusy(false);}
  }
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('room');
    if(id){setMode('friend');setStarted(false);setRoomInput(id);loadRoom(id);}
  },[]);
  useEffect(()=>{
    if(!room?.id||room.status==='finished'||!isFriend)return;
    const controller=new AbortController();let alive=true;
    async function poll(){
      if(document.hidden)return;
      try{const response=await fetch(`/api/rooms?room=${encodeURIComponent(room.id)}`,{signal:controller.signal});const next:any=await response.json();if(!response.ok)throw new Error(next.error);if(alive)acceptRoom(next);}
      catch(e){if(alive)setOnlineError((e as Error).message||'Mất kết nối. Đang thử lại…');}
    }
    const timer=setInterval(poll,1500);document.addEventListener('visibilitychange',poll);
    return()=>{alive=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[room?.id,room?.status,isFriend]);
  function chooseMode(next:string){
    cancel();setMode(next);setGame(newGame());setStarted(next==='local');setError('');setRoom(null);setOnlineError('');
    const url=new URL(window.location.href);url.searchParams.delete('room');url.searchParams.set('play','1');window.history.replaceState(null,'',url);
  }
  function configure(update:()=>void){cancel();update();setGame(newGame());setStarted(false);setError('');}
  async function begin(){
    cancel();const version=epoch.current;setError('');setGame(newGame());setStarted(false);
    if(isPython){
      setBusy(true);setMessage('Đang tải Python. Lần đầu có thể mất một phút…');
      try{let source=bot?.code||draft;
        if(botId.startsWith('example:')){const sample=BOT_EXAMPLES.find(b=>`example:${b.id}`===botId);if(!sample)throw new Error('Không tìm thấy bot mẫu.');const response=await fetch(`/bots/${sample.id}.py`);if(!response.ok)throw new Error('Không tải được bot mẫu. Hãy thử lại.');source=await response.text();if(version!==epoch.current)return;}
        const runner=createPythonPlayer(source,setMessage);player.current=runner;await runner.ready;if(version!==epoch.current)return;setMessage('');}
      catch(e){if(version===epoch.current){setError((e as Error).message);setBusy(false);}return;}
    }
    if(version===epoch.current){setBusy(false);setStarted(true);}
  }
  useEffect(()=>{
    if(isFriend||mode==='local'||!started||game.status!=='playing'||game.turn===side)return;
    const version=epoch.current;let alive=true;setBusy(true);setMessage(isPython?`${pythonName} đang chọn nước đi…`:'Máy đang chọn nước đi…');
    const timer=setTimeout(async()=>{
      try{
        const move=isPython?await player.current!.choose(botState(game)):referenceMove(game.board,game.turn,strategy,42+game.moves.length*37);
        if(!alive||version!==epoch.current)return;
        setGame(playTurn(game,move));setSelected(null);
      }catch(e){
        if(alive&&version===epoch.current){setError((e as Error).message);setGame({...game,status:'finished',winner:side,reason:'bot_error'});player.current?.dispose();player.current=null;}
      }finally{if(alive&&version===epoch.current){setBusy(false);setMessage('');}}
    },350);
    return()=>{alive=false;clearTimeout(timer);};
  },[game,started,mode,side,strategy]);
  useEffect(()=>{if(game.status==='finished'){player.current?.dispose();player.current=null;}},[game.status]);
  async function roomAction(action:string,extra:any={}){
    const version=epoch.current;setBusy(true);setError('');
    try{
      const response=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:room?.id,...extra})});
      const data:any=await response.json();if(!response.ok)throw new Error(data.error);
      if(version!==epoch.current)return;acceptRoom(data);setSelected(null);
      const url=new URL(window.location.href);url.searchParams.set('play','1');url.searchParams.set('room',data.id);window.history.replaceState(null,'',url);
    }catch(e){if(version===epoch.current)setError((e as Error).message);}finally{if(version===epoch.current)setBusy(false);}
  }
  function cell(coord:string){
    if(!canPlay)return;setError('');
    if(selected){
      const move=legalMoves(current.board,current.turn).find((m:any)=>m.from===selected&&m.to===coord);
      if(move){setSelected(null);if(isFriend)roomAction('move',{move:{from:move.from,to:move.to},revision:room.revision});else setGame(playTurn(current,move));return;}
    }
    const x=coord.charCodeAt(0)-65,y=Number(coord[1])-1,piece=current.board[y][x];
    if(piece?.player===current.turn){setSelected(selected===coord?null:coord);return;}
    if(selected)setError('Ô này không phải nước đi hợp lệ. Chọn một ô sáng hoặc một quân khác.');
  }
  function join(){
    let id=roomInput.trim();try{if(id.includes('/')||id.includes('?'))id=new URL(id,window.location.origin).searchParams.get('room')||'';}catch{id='';}
    if(!/^[0-9a-f-]{36}$/i.test(id)){setError('Nhập mã phòng hoặc liên kết mời hợp lệ.');return;}
    roomAction('join',{room:id});
  }
  const names=isFriend&&room?[room.host,room.guest||'Đang chờ bạn…']:mode==='local'?['Người chơi 1','Người chơi 2']:side==='P1'?['Bạn',isPython?pythonName:strategy==='greedy'?'Greedy Bot':'Random Bot']:[isPython?pythonName:strategy==='greedy'?'Greedy Bot':'Random Bot','Bạn'];
  const status=busy?message||'Đang đồng bộ…':isFriend&&room?.status==='waiting'?'Đang chờ người chơi thứ hai':current.status==='finished'?gameMessage(current):!started&&!isFriend?'Chọn đối thủ, sau đó bắt đầu ván đấu.':isFriend&&!room?'Tạo phòng mới hoặc nhập liên kết của bạn.':isFriend&&room.role==='spectator'?'Bạn đang xem phòng đấu.':selected?`Đã chọn ${selected}. Chọn một ô sáng để di chuyển.`:`Lượt ${current.turn} · ${current.turn==='P1'?names[0]:names[1]}`;
  return <>
    <div className="page-title"><div><h1>Tự tay đi nước cờ.</h1><p>Hiểu bàn cờ bằng cách chơi. Thử chiến thuật của bạn, của máy hoặc của một người bạn.</p></div><span className="tag play-rules-tag">9 × 9 · P1 → I1 · P2 → A9</span></div>
    <div className="play-modes" role="tablist" aria-label="Chế độ chơi">{MODES.map(({id,label,icon:Icon})=><button key={id} role="tab" aria-selected={mode===id} onClick={()=>chooseMode(id)} className={mode===id?'active':''}><Icon size={19}/>{label}</button>)}</div>
    {error?<div className="alert error" role="alert"><Info size={18}/><span>{error}</span><button aria-label="Đóng lỗi chơi game" onClick={()=>setError('')}><X size={16}/></button></div>:null}
    {isFriend?<section className="surface friend-controls">
      {!user?<><p>Đăng nhập để tạo phòng và chơi trực tuyến cùng bạn bè.</p><a className="button dark" target="_top" href="/signin-with-chatgpt?return_to=%2F%3Fplay%3D1"><LogIn size={16}/> Đăng nhập</a></>:!room?<><div className="friend-create"><h2>Một bàn cờ. Hai người bạn.</h2><p>Tạo phòng, gửi liên kết và chờ bạn vào chơi.</p><button className="button dark" disabled={busy} onClick={()=>roomAction('create')}><Plus size={16}/> Tạo phòng 1v1</button></div><form className="friend-join" onSubmit={e=>{e.preventDefault();join();}}><label>Mã hoặc liên kết phòng<input value={roomInput} onChange={e=>setRoomInput(e.target.value)} placeholder="Dán liên kết mời…" required maxLength={500}/></label><button className="button secondary" disabled={busy}><Link size={16}/> Tham gia phòng</button></form></>:<><div className="invite-room"><div><strong>Phòng 1v1</strong><span className="mono">{room.id.slice(0,8).toUpperCase()} · {room.role==='spectator'?'Khán giả':`Bạn là ${room.role}`}</span></div><label className="invite-field"><span className="sr-only">Liên kết mời</span><input readOnly value={invite} onFocus={e=>e.target.select()}/></label><button className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{setError('Không sao chép tự động được. Chọn và sao chép liên kết trong ô bên cạnh.');}}}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Đã sao chép':'Sao chép mời'}</button>{room.role==='spectator'&&room.status==='waiting'?<button className="button dark" disabled={busy} onClick={()=>roomAction('join')}>Vào ghế P2 <ArrowUpRight size={16}/></button>:null}</div><div className="room-actions"><span>{room.status==='waiting'?'Bắt đầu ngay khi P2 tham gia.':room.status==='finished'?'Ván đấu đã kết thúc.':'Hai bên luân phiên đi quân. Bàn cờ tự đồng bộ.'}</span>{room.role!=='spectator'&&room.status!=='finished'?<button className="text-link" disabled={busy} onClick={()=>roomAction('resign')}>{room.status==='waiting'?'Đóng phòng':'Đầu hàng'}</button>:null}<button className="text-link" onClick={()=>chooseMode('friend')}>Rời phòng</button></div></>}
      <div className="inline-note"><Info size={16}/><span>Bạn bè cần có quyền truy cập website để mở liên kết. Phòng hết hạn sau 24 giờ. Hai người cần dùng hai tài khoản khác nhau.</span></div>
      {onlineError?<p className="connection-error" role="status">{onlineError} Đang tự kết nối lại…</p>:null}
    </section>:<section className="surface human-config">
      {mode==='local'?<div className="local-description"><Users size={22}/><div><strong>Hai người, cùng một thiết bị.</strong><p>Không có bot. Luân phiên điều khiển P1 và P2, hoặc tự thử cả hai phía.</p></div></div>:<>
        {isPython?<label>Bot của bạn<select value={botId} disabled={busy} onChange={e=>configure(()=>setBotId(e.target.value))}><option value="draft">Bot Python · bản nháp hiện tại</option>{BOT_EXAMPLES.map(b=><option key={b.id} value={`example:${b.id}`}>{b.name} · bot mẫu</option>)}{bots.map(b=><option key={b.id} value={b.id}>{b.name} · v{b.version}</option>)}</select></label>:<label>Đối thủ máy<select value={strategy} onChange={e=>configure(()=>setStrategy(e.target.value))}><option value="greedy">Greedy Bot · tiến về đích</option><option value="random">Random Bot · ngẫu nhiên</option></select></label>}
        <label>Bạn cầm quân<select value={side} onChange={e=>configure(()=>{setSide(e.target.value);setFlipped(e.target.value==='P2');})}><option value="P1">P1 · đi trước</option><option value="P2">P2 · đi sau</option></select></label>
      </>}
      <button className="button dark" disabled={busy} onClick={begin}>{busy?<LoaderCircle size={16} className="spin"/>:<Gamepad2 size={17}/>} {started?'Ván mới':'Bắt đầu chơi'}</button>
      {busy&&isPython?<button className="button secondary" onClick={()=>{cancel();setStarted(false);}}>Dừng bot</button>:null}
      {mode==='local'?<button className="button secondary" disabled={!game.moves.length} onClick={()=>{setGame(replayGame(game.moves.slice(0,-1)));setSelected(null);setError('');}}><Undo2 size={16}/> Hoàn tác</button>:null}
      {isPython?<button className="text-link" onClick={onEdit}>Chỉnh sửa bot <ArrowUpRight size={14}/></button>:null}
    </section>}
    <div className="human-layout"><section className="arena-panel human-arena">
      <div className="arena-heading"><span className="live-label"><span/> {isFriend?'PHÒNG 1V1':'BÀN CỜ CỦA BẠN'}</span><button className="flip-board" onClick={()=>setFlipped(v=>!v)} aria-label="Đổi góc nhìn bàn cờ"><RotateCcw size={14}/> Đổi góc nhìn</button></div>
      <div className="arena-players"><div><span className="player-dot green"/><span>{names[0]}<small>P1 · đích I1</small></span></div><span>vs</span><div><span>{names[1]}<small>P2 · đích A9</small></span><span className="player-dot coral"/></div></div>
      <PlayBoard game={current} selected={selected} onCell={cell} enabled={Boolean(canPlay)} flipped={flipped}/>
      <div className={`human-status ${current.status==='finished'?'game-finished':''}`} role="status" aria-live="polite">{busy?<LoaderCircle size={17} className="spin"/>:current.status==='finished'?<Flag size={17}/>:<span className={`player-dot ${current.turn==='P1'?'green':'coral'}`}/>}<span>{status}</span></div>
    </section><aside className="human-sidebar"><section className="surface human-instructions"><h2>Chọn quân. Chọn nước đi.</h2><p>Bấm một quân của bên đến lượt. Các ô sáng là nước đi hợp lệ. Bấm một ô sáng để di chuyển hoặc ăn quân.</p><div className="human-rule"><span className="piece p1"><Hexagon size={20}/></span><ArrowRight size={15}/><Scissors size={21}/><span>Đấm ăn Kéo</span></div><div className="human-rule"><span className="piece p1"><Scissors size={20}/></span><ArrowRight size={15}/><Hand size={21}/><span>Kéo ăn Lá</span></div><div className="human-rule"><span className="piece p1"><Hand size={20}/></span><ArrowRight size={15}/><Hexagon size={21}/><span>Lá ăn Đấm</span></div><p className="keyboard-tip">Bàn phím: Tab vào bàn cờ, phím mũi tên để chọn ô, Enter hoặc Space để đi quân.</p>{isPython?<p className="python-player-note">Bot Python giữ trạng thái trong suốt ván. Giới hạn 2 giây/nước; nước sai hoặc quá thời gian sẽ bị xử thua.</p>:null}</section>
      <section className="surface human-history"><div className="section-heading"><h2>Nước đi</h2><span className="mono">{current.moves.length} / 200</span></div>{current.moves.length?<ol className="human-moves">{current.moves.map((m:any,i:number)=><li key={i}><span className="mono">{String(i+1).padStart(2,'0')}</span><span className={`player-dot ${m.player==='P1'?'green':'coral'}`}/><span>{m.from} <ArrowRight size={12}/> {m.to}</span>{m.capture?<span className="capture">Ăn {PIECES[m.capture]}</span>:null}</li>)}</ol>:<p className="human-history-empty">Mọi chiến thuật đều bắt đầu bằng một nước đi.</p>}<button className="button secondary" disabled={!current.moves.length} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({kind:'human',mode,moves:current.moves,winner:current.winner,reason:current.reason,engine:current.engine},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='van-dau.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><Download size={15}/> Tải ván đấu</button></section>
    </aside></div>
  </>;
}
