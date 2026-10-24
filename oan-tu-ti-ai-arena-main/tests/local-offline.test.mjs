import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { verifyExport } from '../scripts/verify-tournament-export.mjs';

if(process.env.ARENA_ALLOW_OFFLINE_TEST!=='1')throw new Error('Explicit offline test opt-in required: briefly detaches the LOCAL app external network, then reconnects it.');
const compose=['compose','-f','compose.local.yaml'];
function run(args,input){return new Promise((resolve,reject)=>{
 const p=spawn('docker',args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
 p.stdout.on('data',d=>{out+=d.toString();});p.stderr.on('data',d=>{err+=d.toString();});p.on('error',reject);
 p.on('close',code=>code===0?resolve(out.trim()):reject(new Error(`Local offline step failed (${code}): ${err.split('\n').filter(line=>line.length<500).slice(-12).join('\n')}`)));
 p.stdin.on('error',()=>{});p.stdin.end(input||'');
});}
const credentials=readFileSync('.secrets/local-admin.json','utf8');
const app=await run([...compose,'ps','-q','app']);assert.match(app,/^[a-f0-9]{12,64}$/);
const network='uet-arena-local_web';
const attached=JSON.parse(await run(['inspect','--format','{{json .NetworkSettings.Networks}}',app]));
assert.ok(attached[network],'Local app web network must initially be attached');
await run([...compose,'exec','-T','app','node','-e',"require('fs').mkdirSync('/tmp/arena-offline',{recursive:true})"]);
for(const file of ['cloud-client.mjs','local-offline-scenario.mjs'])await run([...compose,'cp',`tests/${file}`,`app:/tmp/arena-offline/${file}`]);
let detached=false,result;
try{
 await run(['network','disconnect',network,app]);detached=true;
 console.log('Local app Internet egress detached; database and judge internal networks retained.');
 const text=await run([...compose,'exec','-T','app','node','/tmp/arena-offline/local-offline-scenario.mjs'],credentials);
 const line=text.split('\n').find(s=>s.startsWith('OFFLINE_REPORT '));assert.ok(line,'Missing offline result');
 const {exported,...report}=JSON.parse(line.slice('OFFLINE_REPORT '.length));
 result={...report,url:`http://localhost:3000/competition#${report.event}`,verification:verifyExport(exported),finishedAt:new Date().toISOString()};
}finally{
 if(detached)await run(['network','connect',network,app]);
}
assert.equal((await fetch('http://localhost:3000/health',{signal:AbortSignal.timeout(10000)})).status,200,'Published localhost port must recover');
mkdirSync('output',{recursive:true});writeFileSync('output/local-offline.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
