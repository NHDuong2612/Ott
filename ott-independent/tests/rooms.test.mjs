import assert from 'node:assert/strict';
// Run against the built Worker preview, which emulates dispatch identity headers.
// The development sign-in middleware intentionally strips caller identity headers.
const base=process.env.OTT_TEST_URL||'http://127.0.0.1:5174';
if(!['127.0.0.1','localhost','::1'].includes(new URL(base).hostname))throw new Error('Room integration checks are restricted to a local preview.');
const key=Date.now(),host=`room-host-${key}`,guest=`room-guest-${key}`,third=`room-other-${key}`;
function headers(user){return user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':`${user}@example.test`,'Content-Type':'application/json',Origin:base}:{'Content-Type':'application/json'};}
async function result(response,expected){const raw=await response.text();assert.equal(response.status,expected,raw);return JSON.parse(raw);}
async function post(user,body,expected=200){return result(await fetch(base+'/api/rooms',{method:'POST',headers:headers(user),body:JSON.stringify(body)}),expected);}
async function get(user,id,expected=200){return result(await fetch(base+`/api/rooms?room=${id}`,{headers:headers(user)}),expected);}
const created=await post(host,{action:'create'});assert.equal(created.role,'P1');assert.equal(created.status,'waiting');
await post(host,{action:'move',room:created.id,revision:0,move:{from:'B8',to:'B7'}},409);
const joined=await post(guest,{action:'join',room:created.id});assert.equal(joined.role,'P2');assert.equal(joined.status,'playing');
await post(third,{action:'join',room:created.id},409);
assert.equal((await get(third,created.id)).role,'spectator');
await post(third,{action:'move',room:created.id,revision:joined.revision,move:{from:'B8',to:'B7'}},403);
await post(guest,{action:'move',room:created.id,revision:joined.revision,move:{from:'B1',to:'A1'}},403);
await post(host,{action:'move',room:created.id,revision:joined.revision,move:{from:'B8',to:'B5'}},400);
const moved=await post(host,{action:'move',room:created.id,revision:joined.revision,move:{from:'B8',to:'B7'}});assert.equal(moved.game.turn,'P2');
await post(guest,{action:'move',room:created.id,revision:joined.revision,move:{from:'B1',to:'A1'}},409);
const raced=await Promise.all([1,2].map(()=>fetch(base+'/api/rooms',{method:'POST',headers:headers(guest),body:JSON.stringify({action:'move',room:created.id,revision:moved.revision,move:{from:'B1',to:'A1'}})})));
assert.equal(raced.filter(r=>r.status===200).length,1);assert.equal(raced.filter(r=>r.status===409||r.status===403).length,1);
await Promise.all(raced.map(response=>response.text()));
const after=await get(host,created.id);assert.equal(after.game.moves.length,2);
const resigned=await post(guest,{action:'resign',room:created.id});assert.equal(resigned.game.winner,'P1');assert.equal(resigned.status,'finished');
await post(host,{action:'move',room:created.id,revision:resigned.revision,move:{from:'B7',to:'B6'}},409);
const waiting=await post(host,{action:'create'});const closed=await post(host,{action:'resign',room:waiting.id});assert.equal(closed.game.reason,'closed');
await get(host,'not-a-room',404);
// Keep this last: Wrangler's local proxy can reset after a POST with an unread
// request body (the anonymous request is rejected before its body is consumed).
await post(null,{action:'create'},401);
console.log('Friend room checks passed: two identities, invitations, waiting state, spectator authorization, turn/illegal-move rejection, revision conflicts, no duplicate moves and resignation.');
