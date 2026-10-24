import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sha, verifyOfficial } from '../competition/store.mjs';
export function verifyExport(data) {
  const snapshot=JSON.parse(data.event.snapshot),sources=new Map(data.submissions.map(v=>[v.id,v]));
  assert.equal(data.entries.length,snapshot.teams.length);
  assert.equal(new Set(data.entries.map(e=>e.team)).size,data.entries.length);
  for(const v of sources.values())assert.equal(sha(v.source),v.sha,'Frozen source SHA mismatch');
  const entries=new Map(data.entries.map(e=>[e.team,sources.get(e.submission)]));
  for(const game of data.games){
    assert.ok(game.result,'Every scheduled game must finish');
    const offset=Math.floor(game.ordinal/2)*2;
    const seed=(snapshot.config.seed+parseInt(sha(game.series+':'+offset).slice(0,7),16))%2147483647;
    verifyOfficial({config:snapshot.config,engine:snapshot.engine,runtime:snapshot.runtime,seed,p1:{sha:entries.get(game.p1).sha},p2:{sha:entries.get(game.p2).sha}},game.result);
  }
  const results=data.audit.filter(a=>a.action==='result').map(a=>JSON.parse(a.detail).job);
  assert.equal(results.length,new Set(results).size,'Duplicate result audit');
  return {entrants:data.entries.length,verifiedReplays:data.games.length,uniqueResultCommits:results.length,infrastructureRetries:data.audit.filter(a=>a.action==='infrastructure-failure').length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(verifyExport(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
