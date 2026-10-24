import { localDatabase } from './sqlite-platform.mjs';
export const env = {
  get DB() { return localDatabase() as unknown as D1Database; },
  ARENA_AUTH_PROVIDER: 'docker',
};
