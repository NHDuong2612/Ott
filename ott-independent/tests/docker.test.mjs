import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const base=process.env.OTT_DOCKER_URL||'http://localhost:3000';
const target=new URL(base);
const local=['localhost','127.0.0.1','::1'].includes(target.hostname);
const deployed=process.env.OTT_ALLOW_VERCEL_TESTS==='1'&&target.protocol==='https:'&&target.hostname.endsWith('.vercel.app');
if(!local&&!deployed)throw new Error('Account checks require loopback or explicit permission for an HTTPS Vercel test deployment.');
class Client{
  jar=new Map();csrf='';
  async request(path,options={}){
    const r=await fetch(base+path,{redirect:'manual',...options,headers:{Cookie:[...this.jar].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
    for(const cookie of r.headers.getSetCookie()){const [key,value]=cookie.split(';')[0].split('=');if(value)this.jar.set(key,value);else this.jar.delete(key);}
    const text=await r.text();return {status:r.status,headers:r.headers,text};
  }
  async form(mode,values,extra={}){
    const page=await this.request('/'+mode);assert.equal(page.status,200,page.text.slice(0,100));
    this.csrf=/name="csrf" value="([a-f0-9]+)"/.exec(page.text)?.[1];assert.ok(this.csrf);
    return this.request('/'+mode,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:base},body:new URLSearchParams({csrf:this.csrf,return_to:'/',...values,...extra})});
  }
  async api(body,expected=200,headers={}){const r=await this.request('/api/data',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert.equal(r.status,expected,r.text);return r.headers.get('content-type')?.includes('application/json')?JSON.parse(r.text):r.text;}
  async data(){const r=await this.request('/api/data');assert.equal(r.status,200,r.text);return JSON.parse(r.text);}
  async room(body,expected=200){const r=await this.request('/api/rooms',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,expected,r.text);return r.headers.get('content-type')?.includes('application/json')?JSON.parse(r.text):r.text;}
}
const a=new Client(),b=new Client(),anonymous=new Client(),nonce=randomBytes(6).toString('hex');
const credentials={email:`arena-qa-${nonce}@vnu.edu.vn`,name:'QA Docker A',password:randomBytes(18).toString('base64url')};
assert.equal((await anonymous.request('/api/data',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.test','x-arena-bootstrap':'1'}})).status,401);
const csrf=await anonymous.form('register',credentials,{csrf:'a'.repeat(64)});assert.equal(csrf.status,403);
const invalid=await anonymous.form('register',{...credentials,password:'short',confirm:'short'});assert.equal(invalid.status,400);
const wrongDomain=await anonymous.form('register',{...credentials,email:`qa-${nonce}@vnu.edu.vn.evil.test`,confirm:credentials.password});assert.equal(wrongDomain.status,400);
const registered=await a.form('register',{...credentials,confirm:credentials.password});assert.equal(registered.status,303,registered.text);
const sessionCookie=registered.headers.getSetCookie().find(v=>v.startsWith('arena_session='));assert.match(sessionCookie,/HttpOnly/);assert.match(sessionCookie,/SameSite=Lax/);assert.match(sessionCookie,/Max-Age=604800/);
if(deployed)assert.match(sessionCookie,/Secure/);
const firstToken=a.jar.get('arena_session');assert.ok(firstToken);
const second={email:`arena-qa-friend-${nonce}@vnu.edu.vn`,name:'QA Docker B',password:randomBytes(18).toString('base64url')};
assert.equal((await b.form('register',{...second,confirm:second.password})).status,303);
await a.api({action:'profile',name:'QA saved profile',team:'Docker test'});
await a.api({action:'submit',name:'QA bot',description:'Disposable integration fixture',code:"def choose_move(state):\n    return state['legal_moves'][0]\n"});
const owned=await a.data();assert.equal(owned.profile.name,'QA saved profile');assert.equal(owned.canSetup,false);assert.equal(owned.bots.length,1);
assert.equal((await b.data()).bots.length,0);
await a.api({action:'profile',name:'QA still A',team:''},200,{'oai-authenticated-user-id':'forged-other','oai-authenticated-user-email':second.email,'x-arena-bootstrap':'1'});
assert.equal((await a.data()).profile.name,'QA still A');assert.equal((await b.data()).profile,null);
await a.api({action:'setup'},403,{'x-arena-bootstrap':'1'});
await a.api({action:'profile',name:'Must reject',team:''},403,{Origin:'https://unrelated.invalid'});
const room=await a.room({action:'create'});assert.equal(room.role,'P1');
const joined=await b.room({action:'join',room:room.id});assert.equal(joined.role,'P2');
await b.room({action:'move',room:room.id,revision:joined.revision,move:{from:'B1',to:'A1'}},403);
const played=await a.room({action:'move',room:room.id,revision:joined.revision,move:{from:'B8',to:'B7'}});assert.equal(played.game.moves.length,1);
await b.room({action:'resign',room:room.id});
if(process.env.OTT_DOCKER_RESTART==='1'){
  const r=spawnSync('docker',['compose','restart','app'],{encoding:'utf8',timeout:45000});assert.equal(r.status,0,r.stderr);
  let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');await r.text();if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,300));}
  assert.ok(ready,'Docker app must recover after restart');assert.equal((await a.data()).bots.length,1,'Session and bot must persist across restart');
  console.log('Docker restart: account session and saved bot persisted.');
}
assert.equal((await a.form('logout',{})).status,303);
assert.equal((await a.request('/api/data')).status,401);
const old=new Client();old.jar.set('arena_session',firstToken);assert.equal((await old.request('/api/data')).status,401);
assert.equal((await a.form('login',{email:credentials.email,password:'incorrect-password'})).status,401);
const login=await a.form('login',credentials);assert.equal(login.status,303,login.text);assert.notEqual(a.jar.get('arena_session'),firstToken);
assert.equal((await a.data()).bots.length,1);
const duplicate=await anonymous.form('register',{...credentials,confirm:credentials.password});assert.equal(duplicate.status,409,duplicate.text);
let limited=false;
for(let i=0;i<11;i++){const r=await anonymous.form('login',{email:`qa-missing-${nonce}@example.test`,password:'incorrect-password'});if(r.status===429){limited=true;assert.equal(r.headers.get('retry-after'),'900');break;}assert.equal(r.status,401);}
assert.ok(limited,'Repeated login attempts must be limited');
await a.form('logout',{});await b.form('logout',{});
console.log('Account checks passed: registration, password checks, CSRF, cookie flags, session rotation/revocation, persistent user data, account isolation, friend turns, no automatic admin, spoofed identity rejection and rate limits.');
