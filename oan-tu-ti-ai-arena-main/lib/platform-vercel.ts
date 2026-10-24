import { database } from './postgres.mjs';
export const env = {
  get DB() { return process.env.DATABASE_URL || process.env.DATABASE_URL_FILE ? database() as unknown as D1Database : undefined; },
  ARENA_AUTH_PROVIDER: 'vercel',
};
