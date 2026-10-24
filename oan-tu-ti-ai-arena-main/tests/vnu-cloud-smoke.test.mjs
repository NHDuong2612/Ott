import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { CloudClient } from './cloud-client.mjs';
import { verifyExport } from '../scripts/verify-tournament-export.mjs';

const local=!!process.env.ARENA_LOCAL_TEST_ORIGIN;
const base=process.env.ARENA_LOCAL_TEST_ORIGIN||process.env.ARENA_CLOUD_TEST_ORIGIN;
if(local){const u=new URL(base);if(process.env.ARENA_ALLOW_LOCAL_SMOKE!=='1'||!['localhost','127.0.0.1'].includes(u.hostname)||u.origin!==base)throw new Error('Explicit loopback-only local smoke test required.');}
else if(process.env.ARENA_ALLOW_CLOUD_SMOKE!=='1'||base!=='https://oan-tu-ti-ai-arena.vercel.app')throw new Error('Explicit opt-in to this project production smoke test required. Creates labeled QA records.');
const nonce=randomBytes(6).toString('hex'),admin=new CloudClient(base),guest=new CloudClient(base);
const accountFile=local?(process.env.ARENA_LOCAL_ADMIN_FILE||'.secrets/local-admin.json'):'.secrets/vercel-demo-admin.json';
if(local&&!existsSync(accountFile)){
  const email=`arena-local-btc-${nonce}@vnu.edu.vn`,password=randomBytes(24).toString('base64url');
  const bootstrap=new CloudClient(base);
  await bootstrap.register(email,'BTC LOCAL QA',password);
  const grant=spawnSync('docker',['compose','-f','compose.local.yaml','exec','-T','app','node','scripts/local-admin.mjs',email],{encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(grant.status,0,'Local organizer grant failed');mkdirSync('.secrets',{recursive:true});writeFileSync(accountFile,JSON.stringify({email,password,origin:base}),{mode:0o600});
}
const credentials=JSON.parse(readFileSync(accountFile,'utf8'));
await admin.login(credentials.email,credentials.password);
assert.equal((await admin.call('/api/competition')).user.admin,true,'Existing admin retains access');
const attempt=async(mode,email,password)=>{
  const c=new CloudClient(base),html=await c.call('/'+mode),csrf=/name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
  return fetch(base+'/'+mode,{redirect:'manual',method:'POST',headers:{Cookie:c.cookies(),Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,name:'QA domain rejection',password,confirm:password,csrf})});
};
for(const email of [`qa-${nonce}@gmail.com`,`qa-${nonce}@vnu.edu.vn.evil.test`,`qa-${nonce}@uet.vnu.edu.vn`]){
  const response=await attempt('register',email,randomBytes(24).toString('base64url'));await response.text();assert.equal(response.status,400);
}
const config={groupCount:1,qualifiers:2,deadline:new Date(admin.serverTime+86400000).toISOString(),seed:42,maxPlies:20,moveMs:2000,startupMs:8000,memoryMB:128,extraSets:0};
if(local){
  for(const kind of ['runner','player']){const r=await fetch(base+'/api/sandbox?kind='+kind);assert.equal(r.status,200);const html=await r.text();assert.ok(!html.includes('https://cdn.jsdelivr.net'));assert.ok(html.includes(base+'/pyodide/'));}
  const manifest=await(await fetch(base+'/pyodide/manifest.json')).json();assert.equal(manifest.version,'0.27.7');
  for(const [file,entry]of Object.entries(manifest.files)){const r=await fetch(base+'/pyodide/'+file);assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal((await r.arrayBuffer()).byteLength,entry.bytes);}
  console.log('Local Python assets and opaque sandbox URLs verified; no runtime CDN references.');
}
const event=(await admin.post({action:'create',name:`QA ${local?'LOCAL ':''}VNU + nộp đồng thời — ${nonce}`,config})).id;
await admin.post({action:'open',event});
const users=[];
for(let i=0;i<2;i++){
  const c=new CloudClient(base),email=`arena-qa-${nonce}-${i}@vnu.edu.vn`,password=randomBytes(24).toString('base64url');
  await c.register(email,`QA VNU ${i+1}`,password);
  const fresh=new CloudClient(base);await fresh.login(email.toUpperCase(),password);
  assert.equal((await fresh.call('/api/competition')).user.admin,false);
  const wrong=await attempt('login',email,'Incorrect-password-123');await wrong.text();assert.equal(wrong.status,401);
  const team=(await admin.post({action:'team',event,name:`QA VNU ${i+1}`,seed:i+1})).id;
  const {token}=await admin.post({action:'invite',event,team,email,student:`QA-${nonce}-${i}`});
  await guest.post({action:'join',token},401);await fresh.post({action:'join',token});
  users.push({client:fresh,team});
}
const source='def choose_move(state): return state["legal_moves"][0]';
const responses=await Promise.all(users.flatMap((u,i)=>Array.from({length:8},()=>u.client.post({action:'submit',event,team:users[1-i].team,source}))));
for(let i=0;i<2;i++){
  assert.equal(new Set(responses.slice(i*8,(i+1)*8).map(r=>r.id)).size,1);
  const own=await users[i].client.call(`/api/competition?event=${event}`);
  assert.equal(own.owned,users[i].team);assert.equal(own.submissions.length,1);
}
let detail;
for(let attempt=0;attempt<90;attempt++){
  detail=await admin.call(`/api/competition?event=${event}`);
  assert.equal(detail.failed.length,0);
  if(!detail.jobs.some(j=>j.kind==='validate'&&['queued','running'].includes(j.status)))break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.equal(detail.jobs.filter(j=>j.kind==='validate'&&j.status==='done').reduce((n,j)=>n+j.count,0),2);
await admin.post({action:'config',event,config:{...config,deadline:new Date(admin.serverTime+2000).toISOString()}});
await new Promise(resolve=>setTimeout(resolve,3000));
assert.equal((await admin.post({action:'freeze',event})).entrants,2);
await users[0].client.post({action:'submit',event,source:'# too late\n'+source},400);
for(let attempt=0;attempt<120;attempt++){
  detail=await admin.call(`/api/competition?event=${event}`);assert.equal(detail.failed.length,0);
  if(detail.event.status==='review')break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.equal(detail.event.status,'review');await admin.post({action:'publish',event});
const exported=await admin.call(`/api/competition?event=${event}&export=1`),verification=verifyExport(exported);
assert.equal(verification.entrants,2);assert.equal(verification.verifiedReplays,4);
const report={url:`${base}/competition#${event}`,status:exported.event.status,concurrentPosts:16,uniqueSubmissions:2,verification,checks:['VNU registration and uppercase login','non-VNU/lookalike/subdomain rejected','wrong password rejected','existing admin preserved','membership required; forged team ignored','concurrent duplicate posts committed once per team','Docker validation and full tournament','late submission rejected'],finishedAt:new Date().toISOString()};
mkdirSync('output',{recursive:true});writeFileSync(local?'output/local-smoke.json':'output/vnu-cloud-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
