import assert from 'node:assert/strict';
import { validRequestOrigin } from '../lib/request-origin.mjs';
const previous={origin:process.env.PUBLIC_ORIGIN,deployment:process.env.ARENA_DEPLOYMENT};
const request=headers=>new Request('http://0.0.0.0:3000/api/data',{method:'POST',headers});
try{
 process.env.PUBLIC_ORIGIN='http://localhost:3000';process.env.ARENA_DEPLOYMENT='local-postgres';
 assert.ok(validRequestOrigin(request({Origin:'http://localhost:3000'})),'Browser public origin must be accepted despite internal Docker URL');
 assert.equal(validRequestOrigin(request({Origin:'http://attacker.example'})),false);
 assert.equal(validRequestOrigin(request({})),false);
 assert.equal(validRequestOrigin(request({Origin:'http://localhost:3000','sec-fetch-site':'cross-site'})),false);
 process.env.ARENA_DEPLOYMENT='docker';assert.ok(validRequestOrigin(request({})),'Legacy gateway already checked and removed Origin');
 delete process.env.PUBLIC_ORIGIN;assert.ok(validRequestOrigin(request({Origin:'http://0.0.0.0:3000'})));
 console.log('Request origin passed: configured public origin, internal Docker routing, missing/cross-site rejection and legacy gateway compatibility.');
}finally{
 if(previous.origin===undefined)delete process.env.PUBLIC_ORIGIN;else process.env.PUBLIC_ORIGIN=previous.origin;
 if(previous.deployment===undefined)delete process.env.ARENA_DEPLOYMENT;else process.env.ARENA_DEPLOYMENT=previous.deployment;
}
