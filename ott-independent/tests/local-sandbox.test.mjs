import assert from 'node:assert/strict';
import { localSandbox } from '../lib/local-sandbox.mjs';
import './request-origin.test.mjs';
for(const kind of ['runner','player']){
  const html=localSandbox(kind,'http://localhost:3000');
  assert.ok(html.includes('http://localhost:3000/pyodide/'));
  assert.ok(html.includes('importScripts('));
  assert.ok(!html.includes('https://cdn.jsdelivr.net'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('event.source!==parent'));
}
assert.equal(localSandbox('../secrets','http://localhost:3000'),null);
assert.throws(()=>localSandbox('runner','javascript:evil'));
console.log('Local sandbox templates preserve message checks and CSP, restrict filenames, and use local runtime assets.');
