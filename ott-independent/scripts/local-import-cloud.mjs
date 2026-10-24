import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync,writeFileSync,unlinkSync,existsSync,readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
// One-way snapshot copy. No SQL is written to the cloud database.
const url=new URL(process.env.DATABASE_URL||'');
if(!url.hostname.endsWith('.neon.tech'))throw new Error('Explicit Neon source DATABASE_URL is required.');
const compose=['compose','-f','compose.local.yaml'];
async function run(args,label){
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';
  child.stdout.on('data',part=>{out+=part.toString();});child.stderr.on('data',()=>{});
  child.on('error',()=>reject(new Error(label+' could not start.')));
  child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(label+` failed (exit ${code}); no secrets printed.`)));
 });
}
const exec=(sql)=>run([...compose,'exec','-T','db','psql','-U','arena','-d','arena','-At','-v','ON_ERROR_STOP=1','-c',sql],'Local database operation');
const empty=await exec("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ('public','arena_competition')");
if(empty!=='0')throw new Error('Local database is not empty. Import refused; existing data was not overwritten.');
mkdirSync('.secrets',{recursive:true});mkdirSync('backups/local',{recursive:true});
const stamp=new Date().toISOString().replaceAll(':','-'),name=`cloud-snapshot-${stamp}.dump`,envFile=resolve('.secrets',`cloud-export-${randomBytes(6).toString('hex')}.env`);
const pairs={PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'require'};
if(Object.values(pairs).some(v=>/[\r\n]/.test(v)))throw new Error('Invalid connection fields');
writeFileSync(envFile,Object.entries(pairs).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});
try{
 console.log('Creating a read-only cloud snapshot...');
 await run(['run','--rm','--env-file',envFile,'-v',`${resolve('backups/local')}:/backups`,'postgres:18-bookworm','pg_dump','-Fc','--no-owner','--no-acl','--schema=public','--schema=arena_competition','--file',`/backups/${name}`],'Cloud snapshot');
 // The local public schema is empty; no CASCADE and no existing tables removed.
 await exec('DROP SCHEMA public');
 console.log('Restoring the snapshot into the empty local database...');
 await run([...compose,'exec','-T','db','pg_restore','-U','arena','-d','arena','--single-transaction','--no-owner','--no-acl','--exit-on-error',`/backups/${name}`],'Local restore');
 await exec("BEGIN; DELETE FROM public.auth_sessions; DELETE FROM public.auth_attempts; DELETE FROM arena_competition.workers; UPDATE arena_competition.jobs SET status='queued',lease=NULL,worker=NULL,\"until\"=0,attempts=0,next=0 WHERE status='running'; COMMIT;");
 const counts=await exec("SELECT json_build_object('accounts',(SELECT COUNT(*) FROM public.auth_users),'events',(SELECT COUNT(*) FROM arena_competition.events),'submissions',(SELECT COUNT(*) FROM arena_competition.submissions),'games',(SELECT COUNT(*) FROM arena_competition.games),'completedGames',(SELECT COUNT(*) FROM arena_competition.games WHERE completed=1))");
 const report={createdAt:new Date().toISOString(),snapshot:`backups/local/${name}`,counts:JSON.parse(counts),note:'Cloud preserved. Local is an independent snapshot; local sessions reset, accounts/passwords/results retained.'};
 mkdirSync('output',{recursive:true});writeFileSync('output/local-import.json',JSON.stringify(report,null,2));
 const adminFile='.secrets/vercel-demo-admin.json';
 if(existsSync(adminFile)){const admin=JSON.parse(readFileSync(adminFile,'utf8'));writeFileSync('.secrets/local-admin.json',JSON.stringify({email:admin.email,password:admin.password,origin:'http://localhost:3000'},null,2),{mode:0o600});}
 console.log(JSON.stringify(report,null,2));
}finally{unlinkSync(envFile);}
