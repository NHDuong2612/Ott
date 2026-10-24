export function createPythonPlayer(code:string,onStatus:(status:string)=>void){
  const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.src=process.env.NEXT_PUBLIC_LOCAL_RUNTIME==='1'?'/api/sandbox?kind=player':'/sandbox/player.html';frame.hidden=true;frame.setAttribute('aria-hidden','true');
  const session=crypto.randomUUID();let disposed=false,sequence=0;
  let readyResolve:()=>void=()=>{},readyReject:(e:Error)=>void=()=>{};
  let pending:{request:number,resolve:(move:any)=>void,reject:(error:Error)=>void}|null=null;
  let timer:ReturnType<typeof setTimeout>;
  const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  function dispose(reason='Đã dừng bot.'){
    if(disposed)return;disposed=true;clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();
    const error=new Error(reason);readyReject(error);pending?.reject(error);pending=null;
  }
  function watchdog(ms:number,message:string){clearTimeout(timer);timer=setTimeout(()=>dispose(message),ms);}
  function receive(event:MessageEvent){
    if(disposed||event.source!==frame.contentWindow||event.data?.session!==session)return;
    const data=event.data;
    if(data.type==='runtime'){onStatus('Đang khởi tạo chiến thuật Python…');watchdog(6000,'Bot bị treo khi khởi tạo.');}
    if(data.type==='ready'){clearTimeout(timer);readyResolve();}
    if(data.type==='move'&&pending&&pending.request===data.request){clearTimeout(timer);const current=pending;pending=null;current.resolve(data.move);}
    if(data.type==='error')dispose(String(data.error||'Bot gặp lỗi.').slice(0,1000));
  }
  window.addEventListener('message',receive);
  frame.onload=()=>frame.contentWindow?.postMessage({type:'init',session,code},'*');
  watchdog(95000,'Python runner không phản hồi. Hãy thử lại.');document.body.appendChild(frame);
  return {ready,dispose,async choose(state:any){
    await ready;if(disposed)throw new Error('Bot đã dừng. Hãy bắt đầu ván mới.');if(pending)throw new Error('Bot đang tính một nước đi.');
    return new Promise<any>((resolve,reject)=>{const request=++sequence;pending={request,resolve,reject};watchdog(3000,'Bot không trả nước đi trong thời gian cho phép.');frame.contentWindow?.postMessage({type:'choose',session,request,state},'*');});
  }};
}
