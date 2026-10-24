import { env } from '@/lib/platform';
import { getChatGPTUser } from '../../chatgpt-auth';
import { replayGame,playTurn } from '../../../lib/player-game.mjs';
import { validRequestOrigin } from '../../../lib/request-origin.mjs';

export const dynamic='force-dynamic';
type Room={id:string,host_id:string,host_name:string,guest_id:string|null,guest_name:string|null,moves:string,revision:number,status:string,winner:string|null,reason:string|null,created:string,expires:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const validId=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
function view(room:Room,userId:string){
  const game=replayGame(JSON.parse(room.moves));
  if(room.status==='finished')Object.assign(game,{status:'finished',winner:room.winner,reason:room.reason});
  return {id:room.id,host:room.host_name,guest:room.guest_name,revision:room.revision,status:room.status,expires:room.expires,role:room.host_id===userId?'P1':room.guest_id===userId?'P2':'spectator',game};
}
async function find(db:D1Database,id:unknown){
  if(!validId(id))return null;
  return db.prepare('SELECT * FROM rooms WHERE id=? AND expires>?').bind(id,new Date().toISOString()).first<Room>();
}
export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Đăng nhập để vào phòng.'},401);
  if(!env.DB)return json({error:'Không thể kết nối phòng đấu.'},503);
  try{const room=await find(env.DB,new URL(request.url).searchParams.get('room'));return room?json(view(room,user.userId)):json({error:'Phòng không tồn tại hoặc đã hết hạn (24 giờ).'},404);}
  catch{return json({error:'Không tải được phòng. Hãy thử lại.'},503);}
}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Đăng nhập để chơi với bạn bè.'},401);
  const db=env.DB;if(!db)return json({error:'Không thể kết nối phòng đấu.'},503);
  if(!validRequestOrigin(request))return json({error:'Origin không hợp lệ.'},403);
  try{
    const raw=await request.text();if(raw.length>2048)return json({error:'Yêu cầu quá lớn.'},413);
    const input=JSON.parse(raw),stamp=new Date().toISOString();
    const profile=await db.prepare('SELECT name FROM profiles WHERE id=?').bind(user.userId).first<{name:string}>();
    const name=(profile?.name||user.displayName).slice(0,60);
    if(input.action==='create'){
      const count=await db.prepare("SELECT COUNT(*) n FROM rooms WHERE host_id=? AND status!='finished' AND expires>?").bind(user.userId,stamp).first<{n:number}>();
      if((count?.n||0)>=5)return json({error:'Bạn đang có 5 phòng mở. Đóng một phòng trước khi tạo thêm.'},400);
      const id=crypto.randomUUID(),expires=new Date(Date.now()+86400000).toISOString();
      await db.prepare("INSERT INTO rooms(id,host_id,host_name,moves,revision,status,created,expires) VALUES(?,?,?,'[]',0,'waiting',?,?)").bind(id,user.userId,name,stamp,expires).run();
      return json(view((await find(db,id))!,user.userId));
    }
    const room=await find(db,input.room);if(!room)return json({error:'Phòng không tồn tại hoặc đã hết hạn.'},404);
    const role=room.host_id===user.userId?'P1':room.guest_id===user.userId?'P2':null;
    if(input.action==='join'){
      if(role)return json(view(room,user.userId));
      if(room.status!=='waiting'||room.guest_id)return json({error:'Phòng đã có hai người chơi hoặc đã kết thúc.'},409);
      const update=await db.prepare("UPDATE rooms SET guest_id=?,guest_name=?,status='playing',revision=revision+1 WHERE id=? AND revision=? AND guest_id IS NULL AND status='waiting'").bind(user.userId,name,room.id,room.revision).run();
      if(!update.meta.changes)return json({error:'Một người khác vừa vào phòng. Hãy tải lại.'},409);
    }else if(input.action==='move'){
      if(!role)return json({error:'Khán giả không được di chuyển quân.'},403);
      if(room.status!=='playing')return json({error:'Phòng chưa đủ người hoặc ván đấu đã kết thúc.'},409);
      if(!Number.isInteger(input.revision)||input.revision!==room.revision)return json({error:'Bàn cờ đã thay đổi. Đang đồng bộ nước mới nhất.'},409);
      const game=replayGame(JSON.parse(room.moves));
      if(role!==game.turn)return json({error:'Chưa đến lượt của bạn.'},403);
      const next=playTurn(game,input.move);
      const update=await db.prepare('UPDATE rooms SET moves=?,status=?,winner=?,reason=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(next.moves),next.status,next.winner,next.reason,room.id,room.revision).run();
      if(!update.meta.changes)return json({error:'Nước đi khác vừa được ghi nhận. Hãy thử lại.'},409);
    }else if(input.action==='resign'){
      if(!role)return json({error:'Bạn không phải người chơi trong phòng.'},403);
      if(room.status==='finished')return json(view(room,user.userId));
      const winner=room.status==='waiting'?null:role==='P1'?'P2':'P1';
      const update=await db.prepare("UPDATE rooms SET status='finished',winner=?,reason=?,revision=revision+1 WHERE id=? AND revision=?").bind(winner,room.status==='waiting'?'closed':'resign',room.id,room.revision).run();
      if(!update.meta.changes)return json({error:'Trạng thái phòng vừa thay đổi. Hãy thử lại.'},409);
    }else return json({error:'Thao tác không hợp lệ.'},400);
    return json(view((await find(db,room.id))!,user.userId));
  }catch(e){const message=e instanceof Error?e.message:'';return json({error:message.includes('quân')||message.includes('ô')||message.includes('Ván đấu')||message.includes('Bot phải')?message:'Yêu cầu không hợp lệ. Hãy thử lại.'},400);}
}
