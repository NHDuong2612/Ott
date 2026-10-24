import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export async function GET(){return new Response(await readFile(path.join(process.cwd(),'docker/auth.css')),{headers:{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=86400'}});}
