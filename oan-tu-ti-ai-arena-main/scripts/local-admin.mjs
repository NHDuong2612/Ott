import { readFileSync } from 'node:fs';
import pg from 'pg';
const email=(process.argv[2]||'').trim().toLowerCase();
if(!email)throw new Error('Supply the registered local account email.');
if(process.env.ARENA_DEPLOYMENT!=='local-postgres')throw new Error('Run this command inside the local app container.');
const client=new pg.Client({connectionString:readFileSync(process.env.DATABASE_URL_FILE,'utf8').trim()});
await client.connect();
try{
 const result=await client.query('UPDATE auth_users SET is_admin=1 WHERE email=$1',[email]);
 if(result.rowCount!==1)throw new Error('Register this account on the local website first.');
 console.log('Local organizer permission granted. Cloud was not changed.');
}finally{await client.end();}
