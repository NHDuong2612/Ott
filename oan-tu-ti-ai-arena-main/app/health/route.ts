import { database } from '../../lib/postgres.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await database().prepare('SELECT 1 AS ready').first(); return new Response('ok', { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return new Response('unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
