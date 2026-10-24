import { competitionRequest } from '../../../competition/vercel.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export function GET(request: Request) { return competitionRequest(request); }
export const POST = GET;
