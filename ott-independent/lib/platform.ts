// Default platform for Sites and the Docker Worker. Next's Vercel build aliases
// this module to platform-vercel.ts; application routes share the same API.
export { env } from 'cloudflare:workers';
