import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isVnuEmail, accountAllowed } from '../lib/account-policy.mjs';
import { register as cloudRegister } from '../lib/vercel-auth-store.mjs';
import { authPage } from '../docker/auth-view.mjs';
import { openStore, register, authenticate, sessionUser, newSession } from '../docker/auth-store.mjs';
assert.ok(isVnuEmail(' Student.01@VNU.EDU.VN '));
for (const email of ['a@gmail.com','a@uet.vnu.edu.vn','a@vnu.edu.vn.attacker.com','a@fakevnu.edu.vn','a@vnu.edu.vn@evil.test','a\n@vnu.edu.vn','.a@vnu.edu.vn','a..b@vnu.edu.vn','a.@vnu.edu.vn']) assert.equal(isVnuEmail(email),false,email);
assert.ok(accountAllowed({email:'btc@example.test',is_admin:1}));
assert.equal(accountAllowed({email:'btc@example.test',is_admin:0}),false);
assert.equal(accountAllowed(null),false);
await assert.rejects(() => cloudRegister({email:'wrong@example.test',password:'not-used'}), {status:400});
const directory=mkdtempSync(path.join(tmpdir(),'uet-policy-')),db=openStore(directory);
try {
  const password='Test-password-123456';
  const user=await register(db,{email:' Student@VNU.EDU.VN ',name:'Student',password});
  assert.equal(user.email,'student@vnu.edu.vn');
  assert.equal((await authenticate(db,'STUDENT@VNU.EDU.VN',password)).id,user.id);
  assert.equal(await authenticate(db,user.email,'incorrect-password'),null);
  assert.equal(sessionUser(db,newSession(db,user.id)).id,user.id);
  await assert.rejects(() => register(db,{email:'a@vnu.edu.vn.evil.test',password}), {status:400});
  // Simulate a legacy non-VNU account: old sessions must not bypass the policy.
  db.prepare('UPDATE users SET email=? WHERE id=?').run('legacy@example.test',user.id);
  const oldSession=newSession(db,user.id);
  assert.equal(sessionUser(db,oldSession),null);
  assert.equal(await authenticate(db,'legacy@example.test',password),null);
  db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(user.id);
  assert.equal((await authenticate(db,'legacy@example.test',password)).id,user.id);
  assert.equal(sessionUser(db,oldSession).id,user.id);
  const html=authPage({mode:'register',csrf:'test',returnTo:'/competition'});
  assert.match(html,/@vnu\.edu\.vn/); assert.match(html,/Không gửi mã xác nhận/);
  console.log('VNU policy passed: exact domain, normalization, rejected lookalikes, local/cloud registration boundary, passwords, legacy sessions and existing admin access.');
} finally { db.close(); rmSync(directory,{recursive:true,force:true}); }
