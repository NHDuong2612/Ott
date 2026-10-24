import { getChatGPTUser } from '../../chatgpt-auth';
import { env } from '@/lib/platform';
import { simulate,verifyReplay } from '../../../lib/engine.mjs';
import { validRequestOrigin } from '../../../lib/request-origin.mjs';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
async function context(){const user=await getChatGPTUser();if(!user)throw new Error('AUTH');if(!env.DB)throw new Error('DB');return {user,db:env.DB};}
export async function GET(){try{
  const {user,db}=await context();
  const [profile,admin,bots,matches,tournaments,registrations,counts]=await Promise.all([
    db.prepare('SELECT * FROM profiles WHERE id=?').bind(user.userId).first(),
    db.prepare("SELECT value FROM settings WHERE key='admin'").first<{value:string}>(),
    db.prepare('SELECT * FROM bots WHERE owner=? ORDER BY created DESC').bind(user.userId).all(),
    db.prepare('SELECT * FROM matches WHERE owner=? ORDER BY created DESC LIMIT 50').bind(user.userId).all(),
    db.prepare('SELECT * FROM tournaments ORDER BY created DESC').all(),
    db.prepare('SELECT * FROM registrations WHERE owner=?').bind(user.userId).all(),
    db.prepare('SELECT (SELECT COUNT(*) FROM bots) bots,(SELECT COUNT(*) FROM profiles) users,(SELECT COUNT(*) FROM matches) matches').first()
  ]);
  const isAdmin=admin?.value===user.userId;
  const audit=isAdmin?await db.prepare('SELECT * FROM audit ORDER BY created DESC LIMIT 20').all():{results:[]};
  return json({profile,bots:bots.results,matches:matches.results.map((m:any)=>({...m,replay:JSON.parse(m.replay)})),tournaments:tournaments.results,registrations:registrations.results,isAdmin,canSetup:!admin&&user.canBootstrap,counts,audit:audit.results});
}catch(e){return json({error:e instanceof Error&&e.message==='AUTH'?'Vui lòng đăng nhập để lưu dữ liệu.':'Không thể tải dữ liệu. Hãy thử lại.'},e instanceof Error&&e.message==='AUTH'?401:503);}}
export async function POST(request:Request){try{
  if(!validRequestOrigin(request))return json({error:'Origin không hợp lệ.'},403);
  if(Number(request.headers.get('content-length')||0)>100000)return json({error:'Dữ liệu quá lớn.'},413);
  const {user,db}=await context();const raw=await request.text();if(raw.length>100000)return json({error:'Dữ liệu quá lớn.'},413);const body=JSON.parse(raw);const stamp=now();
  const admin=await db.prepare("SELECT value FROM settings WHERE key='admin'").first<{value:string}>();
  if(body.action==='profile'){
    const name=String(body.name||'').trim(),team=String(body.team||'').trim();if(!name||name.length>60||team.length>80)throw new Error('Tên tối đa 60 ký tự; tên đội tối đa 80 ký tự.');
    await db.prepare('INSERT INTO profiles(id,name,team,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,team=excluded.team').bind(user.userId,name,team,stamp).run();
  }else if(body.action==='submit'){
    const name=String(body.name||'').trim(),description=String(body.description||'').trim(),code=String(body.code||'');if(!name||name.length>50||description.length>300||code.length>64000||!code.includes('def choose_move'))throw new Error('Cần tên bot và file Python có hàm choose_move(state), tối đa 64 KB.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const count=await db.prepare('SELECT COUNT(*) n FROM bots WHERE owner=?').bind(user.userId).first<{n:number}>();if((count?.n||0)>=100)throw new Error('Tối đa 100 phiên bản trên mỗi tài khoản.');
    const v=await db.prepare('SELECT MAX(version) n FROM bots WHERE owner=? AND name=?').bind(user.userId,name).first<{n:number}>();
    await db.prepare('INSERT INTO bots(id,owner,name,description,code,hash,version,status,created) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(),user.userId,name,description,code,hash,(v?.n||0)+1,'submitted',stamp).run();
  }else if(body.action==='match'){
    verifyReplay(body.replay);const bot=body.botId?await db.prepare('SELECT id,name FROM bots WHERE id=? AND owner=?').bind(body.botId,user.userId).first<{id:string,name:string}>():null;
    if(body.botId&&!bot)throw new Error('Không tìm thấy bot.');
    const count=await db.prepare('SELECT COUNT(*) n FROM matches WHERE owner=?').bind(user.userId).first<{n:number}>();if((count?.n||0)>=500)throw new Error('Đã đạt giới hạn 500 replay.');
    await db.prepare('INSERT INTO matches(id,owner,bot_id,opponent,name,replay,kind,created) VALUES(?,?,?,?,?,?,?,?)').bind(id(),user.userId,bot?.id??null,String(body.opponent||'Random Bot').slice(0,50),bot?.name||'Bot tham chiếu',JSON.stringify(body.replay),'practice',stamp).run();
  }else if(body.action==='register'){
    const t=await db.prepare("SELECT * FROM tournaments WHERE id=? AND status='open'").bind(body.tournamentId).first<any>();if(!t||new Date(t.deadline)<new Date())throw new Error('Giải đã đóng đăng ký.');
    const bot=await db.prepare('SELECT id FROM bots WHERE id=? AND owner=?').bind(body.botId,user.userId).first();if(!bot)throw new Error('Chọn một phiên bản bot của bạn.');
    if(await db.prepare('SELECT id FROM registrations WHERE tournament_id=? AND owner=?').bind(t.id,user.userId).first())throw new Error('Bạn đã đăng ký giải này.');
    await db.prepare('INSERT INTO registrations(id,owner,tournament_id,bot_id,created) VALUES(?,?,?,?,?)').bind(id(),user.userId,t.id,body.botId,stamp).run();
  }else if(body.action==='setup'){
    if(!user.canBootstrap)return json({error:'Chủ máy chủ cần cấp quyền quản trị cho tài khoản này.'},403);
    if(admin)throw new Error('Đã có người quản trị.');
    // Sites uses its owner-private boundary; Docker requires an explicit CLI grant.
    await db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('admin',?)").bind(user.userId).run();
  }else{
    if(admin?.value!==user.userId)return json({error:'Chỉ ban tổ chức được thực hiện thao tác này.'},403);
    if(body.action==='tournament'){
      const name=String(body.name||'').trim(),deadline=String(body.deadline||'');if(!name||name.length>100||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<Date.now())throw new Error('Nhập tên giải và hạn nộp trong tương lai.');
      await db.prepare('INSERT INTO tournaments(id,name,description,status,deadline,created) VALUES(?,?,?,?,?,?)').bind(id(),name,String(body.description||'').slice(0,500),'open',new Date(deadline).toISOString(),stamp).run();
    }else if(body.action==='status'){
      if(!['open','locked','finished'].includes(body.status))throw new Error('Trạng thái không hợp lệ.');
      const t=await db.prepare('SELECT id,status FROM tournaments WHERE id=?').bind(body.tournamentId).first<any>();if(!t)throw new Error('Không tìm thấy giải.');
      if(t.status==='finished')throw new Error('Giải đã kết thúc.');
      if(body.status==='finished')throw new Error('Chỉ công bố kết quả sau khi kết nối runner chính thức.');
      await db.prepare('UPDATE tournaments SET status=? WHERE id=?').bind(body.status,t.id).run();
    }else if(body.action==='exhibition'){
      for(const sides of [['greedy','random'],['random','greedy']]){const replay=simulate(sides[0],sides[1],42);await db.prepare('INSERT INTO matches(id,owner,bot_id,opponent,name,replay,kind,created) VALUES(?,?,?,?,?,?,?,?)').bind(id(),user.userId,null,sides[1]==='greedy'?'Greedy Bot':'Random Bot',sides[0]==='greedy'?'Greedy Bot':'Random Bot',JSON.stringify(replay),'exhibition',stamp).run();}
    }else throw new Error('Thao tác không hợp lệ.');
    await db.prepare('INSERT INTO audit(id,owner,action,created) VALUES(?,?,?,?)').bind(id(),user.userId,body.action,stamp).run();
  }
  return json({ok:true});
}catch(e){const message=e instanceof Error?e.message:'Có lỗi xảy ra.';return json({error:message==='AUTH'?'Vui lòng đăng nhập.':message==='DB'?'Cơ sở dữ liệu chưa sẵn sàng.':message},message==='AUTH'?401:400);}}
