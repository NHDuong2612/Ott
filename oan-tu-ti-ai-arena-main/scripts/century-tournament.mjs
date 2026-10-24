import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { CloudClient } from '../tests/cloud-client.mjs';
import { opponent } from './century-bots.mjs';
import { verifyExport } from './verify-tournament-export.mjs';

const base='https://oan-tu-ti-ai-arena.vercel.app';
const file=process.env.CENTURY_STATE_FILE||'.secrets/century-tournament.json', command=process.argv[2]||'prepare';
fs.mkdirSync('.secrets',{recursive:true});fs.mkdirSync('output/century/bots',{recursive:true});
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{nonce:randomBytes(5).toString('hex'),seed:randomInt(1,2147483647),playerSeed:randomInt(1,101),opponents:[]};
const playerSource=state.playerSource||'public/bots/vanguard.py',playerName=state.playerName||'Vanguard';
const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const adminAccount=JSON.parse(fs.readFileSync('.secrets/vercel-demo-admin.json','utf8'));
const admin=new CloudClient(base);
if(state.adminJar)admin.jar=new Map(state.adminJar);
if(!(await admin.call('/api/competition')).user?.admin){await admin.login(adminAccount.email,adminAccount.password);state.adminJar=[...admin.jar];save();}
async function post(client,body){for(let n=0;;n++){try{return await client.post(body);}catch(e){if(n>=4||![429,502,503,504].includes(e.actual))throw e;await sleep(1500*(n+1));}}}
const config={groupCount:32,qualifiers:1,deadline:new Date(admin.serverTime+86400000).toISOString(),seed:state.seed,maxPlies:200,moveMs:2000,startupMs:8000,memoryMB:128,extraSets:1};
if(!state.event){state.config=config;state.event=(await post(admin,{action:'create',name:state.title||'UET TEST 100 — Bạn và 99 bot',config})).id;save();}
const detail=()=>admin.call(`/api/competition?event=${state.event}`);
if(command==='prepare'){
 if(!['draft','open'].includes((await detail()).event.status))throw new Error('This test is already locked. Use a new private state file for another tournament.');
 if(!state.playerTeam){state.playerTeam=(await post(admin,{action:'team',event:state.event,name:'BẠN · '+playerName,seed:state.playerSeed})).id;save();}
 if((await detail()).event.status==='draft')await post(admin,{action:'open',event:state.event});
 for(let i=0;i<99;i++){
  const bot=opponent(i);let row=state.opponents[i];
  if(!row){row={index:i,name:bot.name,family:bot.family,email:`arena-test100-${state.nonce}-${i}@vnu.edu.vn`,password:randomBytes(24).toString('base64url'),seed:i+1>=state.playerSeed?i+2:i+1};state.opponents[i]=row;save();}
  const client=new CloudClient(base);
  if(row.jar)client.jar=new Map(row.jar);
  else{await client.register(row.email,`BOT TEST ${String(i+1).padStart(3,'0')}`,row.password);row.jar=[...client.jar];save();}
  if(!row.team){row.team=(await post(admin,{action:'team',event:state.event,name:`BOT ${String(i+1).padStart(3,'0')} · ${bot.name}`,seed:row.seed})).id;save();}
  if(!row.joined){const current=await client.call(`/api/competition?event=${state.event}`);if(!current.owned){const {token}=await post(admin,{action:'invite',event:state.event,team:row.team,email:row.email,student:`TEST100-${state.nonce}-${i}`});await post(client,{action:'join',token});}row.joined=true;save();}
  const sourceFile=`output/century/bots/bot-${String(i+1).padStart(3,'0')}.py`;fs.writeFileSync(sourceFile,bot.source);
  if(!row.submission){row.submission=(await post(client,{action:'submit',event:state.event,source:bot.source})).id;row.sha=createHash('sha256').update(bot.source).digest('hex');save();}
  if((i+1)%10===0||i===98)console.log(`Prepared ${i+1}/99 opponents through website APIs.`);
 }
 fs.copyFileSync(playerSource,'output/century/bot-cua-ban.py');
 console.log(`Prepared: ${base}/competition#${state.event}. Player seed randomly assigned ${state.playerSeed}; waiting to attach your account before lock.`);
}else if(command==='participant'){
 const email=(process.argv[3]||'').trim().toLowerCase();if(!email)throw new Error('Supply the confirmed participant email.');
 const current=await detail();if(!['draft','open'].includes(current.event.status))throw new Error('Roster is locked.');
 const data=await post(admin,{action:'invite',event:state.event,team:state.playerTeam,email,student:`TEST100-${state.nonce}-PLAYER`});
 state.playerEmail=email;state.playerToken=data.token;save();
 if(email===adminAccount.email){await post(admin,{action:'join',token:data.token});state.playerSubmission=(await post(admin,{action:'submit',event:state.event,source:fs.readFileSync(playerSource,'utf8')})).id;state.playerJoined=true;save();console.log('Your demo account joined and submitted '+playerName+' through the public API.');}
 else console.log('Private invitation saved in the configured state file. Participant must redeem it and submit their bot before lock.');
}else if(command==='run'){
 let current=await detail();
 if(current.event.status==='open'||current.event.status==='locking'){
  if(current.teams.length!==100||current.members.length!==100)throw new Error('Need exactly 100 teams with 100 linked participants before lock.');
  for(let n=0;;n++){current=await detail();const pending=current.jobs.filter(j=>j.kind==='validate'&&['queued','running'].includes(j.status)).reduce((n,j)=>n+j.count,0);if(!pending)break;if(n%6===0)console.log(`Validation pending: ${pending}`);if(current.failed.length)throw new Error('Validation infrastructure failed; inspect before locking.');await sleep(5000);}
  const {withCompetition}=await import('../competition/postgres.mjs');
  const counts=await withCompetition(db=>db.prepare('SELECT status,COUNT(*) count FROM submissions v JOIN teams t ON t.id=v.team WHERE t.event=? GROUP BY status').all(state.event));
  if(counts.find(r=>r.status==='valid')?.count!==100||counts.some(r=>r.status!=='valid'))throw new Error('All 100 submitted bots must validate before locking.');
  await post(admin,{action:'config',event:state.event,config:{...state.config,deadline:new Date(admin.serverTime+2000).toISOString()}});await sleep(3000);
  const frozen=await post(admin,{action:'freeze',event:state.event});if(frozen.entrants!==100)throw new Error('Incorrect frozen entrant count.');state.frozenAt=new Date().toISOString();save();console.log(`Locked ${frozen.entrants} entrants; scheduled ${frozen.games} group games.`);
 }
 let last='';
 for(;;){current=await detail();const done=current.jobs.filter(j=>j.status==='done'&&j.kind==='game').reduce((n,j)=>n+j.count,0),queued=current.jobs.filter(j=>j.status!=='done'&&j.kind==='game').reduce((n,j)=>n+j.count,0);const line=`${current.event.status}: ${done} games done, ${queued} remaining; failed ${current.failed.length}`;if(line!==last){console.log(line);last=line;}
  fs.writeFileSync('output/century/progress.json',JSON.stringify({event:state.event,url:`${base}/competition#${state.event}`,status:current.event.status,done,remaining:queued,failed:current.failed.length,checkedAt:new Date().toISOString()},null,2));
  if(current.failed.length)throw new Error('Infrastructure job failed; inspect and retry before continuing.');
  if(['review','published'].includes(current.event.status))break;await sleep(5000);
 }
 if(current.event.status==='review'){await post(admin,{action:'publish',event:state.event});current=await detail();}
 const exported=await admin.call(`/api/competition?event=${state.event}&export=1`);
 const verification=verifyExport(exported);
 fs.writeFileSync('output/century/tournament-export.json',JSON.stringify(exported,null,2));
 const own=current.standings.find(r=>r.team===state.playerTeam),knockout=current.series.filter(s=>s.stage==='knockout'),final=knockout.reduce((a,b)=>!a||b.round>a.round?b:a,null),lost=knockout.find(s=>(s.a===state.playerTeam||s.b===state.playerTeam)&&s.winner!==state.playerTeam);
 const place=final?.winner===state.playerTeam?'1':lost?(lost.round===final.round?'2':`${2**(final.round-lost.round)+1}–${2**(final.round-lost.round+1)}`):'33–100 (dừng ở vòng bảng)';
 const groups=current.standings.filter(r=>r.group_no===own.group_no),groupPlace=groups.findIndex(r=>r.team===state.playerTeam)+1;
 const report={url:`${base}/competition#${state.event}`,event:state.event,teams:100,validBots:100,completedGames:exported.games.length,status:current.event.status,verification,player:{team:state.playerTeam,seed:state.playerSeed,group:own.group_no,groupPlace,groupSize:groups.length,groupPoints:own.points,won:own.won,drawn:own.drawn,lost:own.lost,placement:place},reasons:exported.games.reduce((a,g)=>{const r=g.result.reason;a[r]=(a[r]||0)+1;return a;},{}),finishedAt:new Date().toISOString()};
 fs.writeFileSync('output/century/result.json',JSON.stringify(report,null,2));
 fs.writeFileSync('output/century/KET_QUA.md',`# Kết quả giải thử UET 100 đội\n\n${report.url}\n\n100 tài khoản/đội, 100 bot hợp lệ. ${report.completedGames} ván đã chấm.\n\n## Đội của bạn — ${playerName}\n\nBảng ${own.group_no}: hạng ${groupPlace}/${groups.length}, ${own.points} điểm; thắng/hòa/thua cặp: ${own.won}/${own.drawn}/${own.lost}.\n\nThành tích chung cuộc: **${place}**. Các đội cùng vòng bị loại có đồng hạng, không tự bịa thứ tự 1–100.\n\nSeed ${state.playerSeed} được bốc ngẫu nhiên trước khi tạo đối thủ. Không sửa seed, source, kết quả hoặc cộng điểm riêng sau khi khóa.\n\nĐây là kiểm thử chức năng bằng 100 đội giả lập, không phải phép đo 100 người dùng đồng thời.\n`);
 console.log(JSON.stringify(report,null,2));
}else throw new Error('Use prepare, participant or run.');
