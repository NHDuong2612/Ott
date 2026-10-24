export function validRequestOrigin(request) {
  const origin=request.headers.get('origin');
  // The legacy gateway checks CSRF before stripping Origin from its proxy.
  // Standalone local uses cookie auth directly and must require Origin itself.
  if(!origin)return process.env.ARENA_DEPLOYMENT!=='local-postgres';
  const expected=process.env.PUBLIC_ORIGIN||new URL(request.url).origin;
  return origin===expected&&request.headers.get('sec-fetch-site')!=='cross-site';
}
