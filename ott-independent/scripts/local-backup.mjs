import { spawn } from 'node:child_process';
import { mkdirSync,openSync,closeSync,unlinkSync } from 'node:fs';
mkdirSync('backups/local',{recursive:true});
const file=`backups/local/arena-${new Date().toISOString().replaceAll(':','-')}.dump`,fd=openSync(file,'wx',0o600);
try{
 await new Promise((resolve,reject)=>{
  const child=spawn('docker',['compose','-f','compose.local.yaml','exec','-T','db','pg_dump','-U','arena','-d','arena','-Fc','--no-owner','--no-acl'],{shell:false,windowsHide:true,stdio:['ignore',fd,'pipe']});
  child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Local backup failed.')));
 });
 console.log('Local backup saved: '+file);
}catch(error){closeSync(fd);unlinkSync(file);throw error;}
closeSync(fd);
