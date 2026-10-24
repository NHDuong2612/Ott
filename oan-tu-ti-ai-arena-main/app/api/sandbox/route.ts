import { localSandbox } from '../../../lib/local-sandbox.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request) {
  if(process.env.ARENA_DEPLOYMENT!=='local-postgres')return new Response('Not found',{status:404});
  const url=new URL(request.url),origin=process.env.PUBLIC_ORIGIN||url.origin;
  const html=localSandbox(url.searchParams.get('kind'),origin);
  return new Response(html||'Not found',{status:html?200:404,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
