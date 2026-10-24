import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync,writeFileSync,statSync } from 'node:fs';
const compose=['compose','-f','compose.local.yaml'];
const run=(command,args)=>new Promise((resolve,reject)=>{
 const p=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
 p.stdout.on('data',d=>{out+=d.toString();});p.stderr.on('data',d=>{err+=d.toString();});p.on('error',reject);
 p.on('close',code=>code===0?resolve(out.trim()):reject(new Error('Local backup verification step failed: exit '+code+' '+err.slice(-700))));
});
const docker=args=>run('docker',[...compose,'exec','-T','db',...args]);
const countSql="SELECT json_build_object('accounts',(SELECT COUNT(*) FROM public.auth_users),'events',(SELECT COUNT(*) FROM arena_competition.events),'submissions',(SELECT COUNT(*) FROM arena_competition.submissions),'games',(SELECT COUNT(*) FROM arena_competition.games))";
const counts=async database=>JSON.parse(await docker(['psql','-U','arena','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',countSql]));
const before=await counts('arena');
const saved=await run(process.execPath,['scripts/local-backup.mjs']);
const file=/Local backup saved: (backups\/local\/arena-[0-9TZ.\-]+\.dump)/.exec(saved)?.[1];
assert.ok(file);assert.ok(statSync(file).size>1000);
const archive='/backups/'+file.split('/').at(-1),restore='restore_check_'+randomBytes(8).toString('hex');
assert.match(restore,/^restore_check_[a-f0-9]{16}$/);
await docker(['createdb','-U','arena',restore]);
try{
 await docker(['pg_restore','--list',archive]);
 // A full pg_dump archive expects initdb's public schema to exist, even when
 // the TOC lists it. Keep the fresh database's empty public schema intact.
 await docker(['pg_restore','-U','arena','-d',restore,'--single-transaction','--no-owner','--no-acl','--exit-on-error',archive]);
 const restored=await counts(restore);assert.deepEqual(restored,before);
 const report={backup:file,bytes:statSync(file).size,counts:restored,restoredToSeparateDatabase:true,finishedAt:new Date().toISOString()};
 mkdirSync('output',{recursive:true});writeFileSync('output/local-backup-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await docker(['dropdb','-U','arena',restore]);}
