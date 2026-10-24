import { readFileSync } from 'node:fs';
export function localSandbox(kind,origin) {
  if(!['runner','player'].includes(kind))return null;
  const url=new URL(origin);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw new Error('Invalid sandbox origin');
  const template=readFileSync(new URL(`../public/sandbox/${kind}.html`,import.meta.url),'utf8');
  // Sandbox keeps its opaque origin. Only public runtime assets have CORS enabled;
  // it receives neither application cookies nor permission to call private APIs.
  return template.replaceAll('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/',origin+'/pyodide/')
    .replaceAll('https://cdn.jsdelivr.net',origin)
    .replaceAll('Kiểm tra kết nối tới jsDelivr.','Kiểm tra máy chủ runtime local.');
}
