import { authHandler } from '../../lib/vercel-auth-handler.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>authHandler(request,'login');
export const POST=GET;
