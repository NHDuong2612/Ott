import { randomBytes, timingSafeEqual } from 'node:crypto';
import { authPage } from '../docker/auth-view.mjs';
import { authenticate, register, sessionUser, newSession, revokeSession, consumeAttempt } from './vercel-auth-store.mjs';

const safeReturn=value=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)&&!/^\/(login|register|logout|signin-with-chatgpt|signout-with-chatgpt)(\/|\?|$)/.test(value)?value:'/';
export async function authHandler(request, mode) {
  const url=new URL(request.url), origin=process.env.PUBLIC_ORIGIN||url.origin;
  const secure=url.protocol==='https:'||process.env.VERCEL==='1'?'; Secure':'';
  const jar=Object.fromEntries((request.headers.get('cookie')||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)));
  const cookie=(name,token,ttl=604800)=>`${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure}`;
  let returnTo=safeReturn(url.searchParams.get('return_to'));
  const redirect=(to,extra=[])=>{const headers=new Headers({'Location':to,'Cache-Control':'no-store'});extra.forEach(v=>headers.append('Set-Cookie',v));return new Response(null,{status:303,headers});};
  function form(status=200,error='',values={},retry=false){
    const csrf=randomBytes(32).toString('hex');
    return new Response(authPage({mode,csrf,returnTo,error,email:values.email||'',name:values.name||''}),{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Set-Cookie':cookie('arena_csrf',csrf,3600),'Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...(retry?{'Retry-After':'900'}:{})}});
  }
  try {
    if(request.method==='GET'){
      const user=await sessionUser(jar.arena_session);
      if(mode==='logout'&&!user)return redirect('/');
      if(mode!=='logout'&&user)return redirect(returnTo);
      return form();
    }
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')return form(403,'Yêu cầu không hợp lệ. Mở lại trang rồi thử lại.');
    if(!(request.headers.get('content-type')||'').startsWith('application/x-www-form-urlencoded'))return new Response('Unsupported form',{status:415});
    const reader=request.body?.getReader(),chunks=[];let size=0;
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return form(413,'Dữ liệu quá lớn.');}chunks.push(value);}
    const input=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));returnTo=safeReturn(input.get('return_to'));
    const csrf=input.get('csrf')||'';
    if(!/^[a-f0-9]{64}$/.test(csrf)||!/^[a-f0-9]{64}$/.test(jar.arena_csrf||'')||!timingSafeEqual(Buffer.from(csrf),Buffer.from(jar.arena_csrf)))return form(403,'Phiên nhập liệu đã hết hạn. Vui lòng thử lại.');
    if(mode==='logout'){await revokeSession(jar.arena_session);return redirect('/',[cookie('arena_session','',0),cookie('arena_csrf','',0)]);}
    const email=(input.get('email')||'').trim().toLowerCase(),password=input.get('password')||'',name=(input.get('name')||'').trim();
    // Vercel overwrites this forwarding header at its edge. Local development
    // shares one loopback bucket; no client-supplied identity header is used.
    const ip=process.env.VERCEL==='1'?(request.headers.get('x-vercel-forwarded-for')||'unknown'):'local';
    if(!await consumeAttempt(ip,email))return form(429,'Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút.',{},true);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!password||password.length>128)return form(400,'Nhập email hợp lệ và mật khẩu tối đa 128 ký tự.',{email,name});
    let account;
    if(mode==='register'){
      if(name.length<2||name.length>60||password.length<12||password!==input.get('confirm'))return form(400,'Tên cần 2–60 ký tự. Mật khẩu cần 12–128 ký tự và hai lần nhập phải khớp.',{email,name});
      account=await register({email,name,password});
    }else{account=await authenticate(email,password);if(!account)return form(401,'Email hoặc mật khẩu chưa đúng.',{email});}
    await revokeSession(jar.arena_session);
    const token=await newSession(account.id);
    return redirect(returnTo,[cookie('arena_session',token),cookie('arena_csrf','',0)]);
  }catch(error){return form(error.status||503,error.status?error.message:'Không thể kết nối tài khoản. Hãy thử lại sau.');}
}
