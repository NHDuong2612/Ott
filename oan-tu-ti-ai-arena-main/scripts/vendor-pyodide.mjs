import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
const directory=new URL('../public/pyodide/',import.meta.url);
await mkdir(directory,{recursive:true});
const manifest={version:'0.27.7',files:{}};
const pinned=JSON.parse(await readFile(new URL('../deploy/pyodide-sha256.json',import.meta.url),'utf8'));
for(const name of ['pyodide.js','pyodide.mjs','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json']){
  const response=await fetch(base+name,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('Could not prepare the pinned local Python runtime: '+name);
  const data=Buffer.from(await response.arrayBuffer());
  if(!data.length)throw new Error('Empty runtime asset');
  const sha256=createHash('sha256').update(data).digest('hex');
  if(sha256!==pinned[name])throw new Error('Local Python runtime checksum mismatch: '+name);
  await writeFile(new URL(name,directory),data);
  manifest.files[name]={bytes:data.length,sha256};
}
await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2));
// Emscripten's .asm.js is CommonJS when used by the Node smoke test. Browser
// workers continue loading it as a classic script; .mjs remains ESM in Node.
await writeFile(new URL('package.json',directory),JSON.stringify({private:true,type:'commonjs'}));
console.log('Pinned Pyodide runtime prepared locally; no runtime CDN is required.');
