import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { database } from '../lib/postgres.mjs';
import { withCompetition } from '../competition/postgres.mjs';
import { submit } from '../competition/store.mjs';

// Synthetic roster only, in a disposable schema. Never creates student accounts
// or jobs in the live tournament schema, and never invokes a Python worker.
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_FILE) throw new Error('Supply a test database environment.');
const total=Number(process.env.SUBMISSION_TEST_TOTAL||100),concurrency=Number(process.env.SUBMISSION_TEST_CONCURRENCY||16);
assert.ok(Number.isInteger(total)&&total>=4&&total<=4000);
assert.ok(Number.isInteger(concurrency)&&concurrency>=2&&concurrency<=128);
const schema=`test_submit_${randomBytes(8).toString('hex')}`,sql=database();
const ddl=(await readFile(new URL('../deploy/competition-schema.sql',import.meta.url),'utf8')).replaceAll('arena_competition',schema).split(';').map(s=>s.trim()).filter(Boolean);
await sql.transaction(ddl);
const write=fn=>withCompetition(fn,{schema,write:true});
const send=(i,source='def choose_move(state): return state["legal_moves"][0]')=>withCompetition(db=>submit(db,{id:`user-${i}`},'event',source),{schema,write:true,submission:{event:'event',user:`user-${i}`}});
const config={groupCount:32,qualifiers:1,deadline:new Date(Date.now()+86400000).toISOString(),seed:42,maxPlies:200,moveMs:2000,startupMs:8000,memoryMB:128,extraSets:1};
try {
  await write(async db=>{
    await db.prepare("INSERT INTO events(id,name,status,config,created) VALUES(?,?,'open',?,?)").run('event','Isolated submission load test',JSON.stringify(config),Date.now());
    await db.batch(async()=>{for(let i=0;i<total+4;i++){
      await db.prepare('INSERT INTO teams(id,event,name,seed,repo) VALUES(?,?,?,?,?)').run(`team-${i}`,'event',`Synthetic ${i}`,i+1,null);
      await db.prepare('INSERT INTO members(event,user,team,student) VALUES(?,?,?,?)').run('event',`user-${i}`,`team-${i}`,`TEST-${i}`);
    }});
  });
  // Prove independent transactions overlap, rather than inferring it from speed.
  let release,entered;
  const hold=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});
  const blocker=withCompetition(async()=>{entered();await hold;},{schema,write:true,submission:{event:'event',user:`user-${total}`}});
  await ready;
  try {
    const independent=await Promise.race([send(total+1),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Independent team blocked by another submission')),15000);timer.unref();})]);
    assert.ok(independent.id);
  } finally {release();await blocker;}
  const duplicates=await Promise.all(Array.from({length:8},()=>send(total+2)));
  assert.equal(new Set(duplicates.map(r=>r.id)).size,1);assert.equal(duplicates.filter(r=>!r.duplicate).length,1);
  const burst=await Promise.allSettled(Array.from({length:8},(_,i)=>send(total+3,`# version ${i}\ndef choose_move(state): return state["legal_moves"][0]`)));
  assert.equal(burst.filter(r=>r.status==='fulfilled').length,1);
  for(const r of burst.filter(r=>r.status==='rejected'))assert.equal(r.reason.status,429);
  const samples=[],errors=[],started=Date.now();let next=0,done=0;
  await Promise.all(Array.from({length:concurrency},async()=>{
    for(;;){const i=next++;if(i>=total)return;const before=Date.now();
      try{assert.ok((await send(i)).id);samples.push(Date.now()-before);}catch(error){errors.push({index:i,status:error.status||error.code||'connection'});}
      if(++done%250===0)console.log(`${done}/${total} submissions finished; errors ${errors.length}`);
    }
  }));
  const elapsedMs=Date.now()-started;
  const counts=await write(async db=>({submissions:(await db.prepare('SELECT COUNT(*) n FROM submissions').get()).n,jobs:(await db.prepare('SELECT COUNT(*) n FROM jobs').get()).n,audit:(await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='submit'").get()).n}));
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,10)));
  assert.deepEqual(counts,{submissions:total+3,jobs:total+3,audit:total+3});
  // A control transaction changes the deadline while another team is submitting.
  // Its exclusive fence must commit before a later submission checks eligibility.
  await write(db=>db.prepare('UPDATE events SET config=? WHERE id=?').run(JSON.stringify({...config,deadline:new Date(Date.now()-1000).toISOString()}),'event'));
  await assert.rejects(()=>send(total,'# late\ndef choose_move(s): return s["legal_moves"][0]'),{status:400});
  samples.sort((a,b)=>a-b);
  const report={total,concurrency,successful:samples.length,errors,elapsedMs,throughputPerSecond:Number((total*1000/elapsedMs).toFixed(2)),p50Ms:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1),checks:['independent teams overlap','duplicate source commits once','same team burst rate limited','atomic source/job/audit counts','closed deadline rejects late submission'],scope:'Database submission path with synthetic memberships, not end-to-end HTTP or 4000 simultaneous users',finishedAt:new Date().toISOString()};
  const reportFile=process.env.SUBMISSION_TEST_REPORT||'output/submission-load.json';
  await mkdir(path.dirname(reportFile),{recursive:true});await writeFile(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  assert.match(schema,/^test_submit_[a-f0-9]{16}$/);
  await sql.query(`DROP SCHEMA ${schema} CASCADE`);
}
