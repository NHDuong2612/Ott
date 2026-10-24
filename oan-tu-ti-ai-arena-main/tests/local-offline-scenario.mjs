import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { CloudClient } from './cloud-client.mjs';

// Executed inside the app container, with its external Docker network detached.
// Credentials arrive on stdin, never in command arguments or test output.
const credentials=JSON.parse(readFileSync(0,'utf8')),base='http://localhost:3000';
const admin=new CloudClient(base),other=new CloudClient(base),nonce=randomBytes(5).toString('hex');
await assert.rejects(()=>fetch('https://example.com',{signal:AbortSignal.timeout(3000)}),'External HTTPS must be unavailable for this test');
assert.equal((await fetch(base+'/health')).status,200);
await admin.login(credentials.email,credentials.password);
assert.equal((await admin.call('/api/competition')).user.admin,true);
assert.ok(await admin.call('/api/data'));
for(const kind of ['player','runner']){
  const response=await fetch(base+'/api/sandbox?kind='+kind),html=await response.text();
  assert.equal(response.status,200);assert.ok(!html.includes('https://cdn.jsdelivr.net'));
}
const {loadPyodide}=await import('file:///app/public/pyodide/pyodide.mjs');
try {
  const py=await loadPyodide({indexURL:'/app/public/pyodide/'});
  assert.equal(py.runPython('import math\nmath.isqrt(2026)'),45);
} catch(error) { throw new Error('Local Python runtime check: '+error.message); }
const email=`arena-offline-${nonce}@vnu.edu.vn`,password=randomBytes(24).toString('base64url');
await other.register(email,'QA OFFLINE',password);
const config={groupCount:1,qualifiers:2,deadline:new Date(admin.serverTime+86400000).toISOString(),seed:42,maxPlies:20,moveMs:2000,startupMs:8000,memoryMB:128,extraSets:0};
const event=(await admin.post({action:'create',name:`QA OFFLINE — ${nonce}`,config})).id;
await admin.post({action:'open',event});
const source='def choose_move(state): return state["legal_moves"][0]';
for(const [i,user,account]of [[0,admin,credentials.email],[1,other,email]]){
  const team=(await admin.post({action:'team',event,name:`OFFLINE ${i+1}`,seed:i+1})).id;
  const {token}=await admin.post({action:'invite',event,team,email:account,student:`OFFLINE-${nonce}-${i}`});
  await user.post({action:'join',token});await user.post({action:'submit',event,source});
}
for(let n=0;;n++){
  const d=await admin.call(`/api/competition?event=${event}`);assert.equal(d.failed.length,0);
  if(d.jobs.filter(j=>j.kind==='validate'&&j.status==='done').reduce((s,j)=>s+j.count,0)===2)break;
  assert.ok(n<120,'Offline validation timed out');await new Promise(r=>setTimeout(r,500));
}
await admin.post({action:'config',event,config:{...config,deadline:new Date(admin.serverTime+1500).toISOString()}});
await new Promise(r=>setTimeout(r,2500));
assert.equal((await admin.post({action:'freeze',event})).entrants,2);
for(let n=0;;n++){
  const d=await admin.call(`/api/competition?event=${event}`);assert.equal(d.failed.length,0);
  if(d.event.status==='review')break;
  assert.ok(n<120,'Offline tournament timed out');await new Promise(r=>setTimeout(r,500));
}
await admin.post({action:'publish',event});
const exported=await admin.call(`/api/competition?event=${event}&export=1`);
assert.equal(exported.games.length,4);assert.ok(exported.games.every(g=>g.result));
console.log('OFFLINE_REPORT '+JSON.stringify({event,status:exported.event.status,externalHttpsBlocked:true,localPythonExecuted:true,exported}));
