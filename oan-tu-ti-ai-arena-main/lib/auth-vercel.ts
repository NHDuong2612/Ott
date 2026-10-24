import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from './vercel-auth-store.mjs';

export type ChatGPTUser = { userId:string,displayName:string,email:string,fullName:string|null,canBootstrap:boolean };
export async function getChatGPTUser():Promise<ChatGPTUser|null> {
  // Vercel has no Sites dispatcher: user identity comes only from this session.
  // Browser-supplied oai-* and x-arena-* headers confer no privileges.
  const token=(await cookies()).get('arena_session')?.value;
  const user=await sessionUser(token);
  return user?{userId:user.id,displayName:user.name,email:user.email,fullName:user.name,canBootstrap:user.is_admin===1}:null;
}
function safe(value:string){return value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)?value:'/';}
export function chatGPTSignInPath(returnTo='/'){return '/login?return_to='+encodeURIComponent(safe(returnTo));}
export function chatGPTSignOutPath(){return '/logout';}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(!user)redirect(chatGPTSignInPath(returnTo));return user;}
