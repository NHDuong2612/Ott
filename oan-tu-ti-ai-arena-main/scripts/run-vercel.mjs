import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);
if(!['build','dev','start'].includes(args[0]))throw new Error('Expected build, dev or start.');
if(!process.env.DATABASE_URL&&existsSync('.env.vercel.local'))process.loadEnvFile('.env.vercel.local');
if(args[0]==='build')await import('./migrate-vercel.mjs');
const cli=new URL('../node_modules/next/dist/bin/next',import.meta.url);
process.argv=[process.execPath,fileURLToPath(cli),...args];
await import(cli.href);
