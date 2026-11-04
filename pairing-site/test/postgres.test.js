'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),zlib=require('node:zlib'),{once}=require('node:events');
const {PostgresStore}=require('../lib/postgres-store'),{dataKey,generateId}=require('../lib/security'),{createServer}=require('../server');
test('PostgreSQL: encrypted, isolated sessions, exclusive leases, CAS, backups, API and retention', {timeout:60000},async()=>{
 const db=new PGlite(),store=new PostgresStore(db,dataKey('34'.repeat(32))),a=generateId(),b=generateId(),payload=zlib.gzipSync(JSON.stringify({registered:true})),backup=zlib.gzipSync(JSON.stringify({warn:3}));let server;
 try{
  await store.indexes();await store.indexes();await store.provision(a.secret,payload,'2348012345678');await store.provision(b.secret,payload,'2348098765432');
  const stored=(await db.query('SELECT * FROM ruthless_pairing.sessions WHERE id=$1',[a.id])).rows[0];assert.equal(stored.secret_hash.length,64);assert.ok(!JSON.stringify(stored).includes(a.secret));assert.ok(!JSON.stringify(stored).includes('registered'));
  const support=(await db.query('SELECT * FROM ruthless_pairing.support WHERE id=$1',[a.id])).rows[0];assert.ok(!JSON.stringify(support).includes('2348012345678'));
  const result=await Promise.all([store.lease(a.id),store.lease(a.id)]);assert.equal(result.filter(Boolean).length,1);const lease=result.find(Boolean).lease;
  assert.deepEqual((await store.getSession(a.id,lease)).current.data,payload);assert.equal(await store.getSession(b.id,lease),null);
  assert.equal((await store.putSession(a.id,lease,1,payload)).version,2);assert.equal(await store.putSession(a.id,lease,1,payload),null);assert.equal((await store.getSession(a.id,lease)).previous.version,1);
  assert.equal((await store.putBackup(a.id,backup,0)).version,1);assert.equal(await store.putBackup(a.id,backup,0),null);assert.equal(await store.getBackup(b.id),null);assert.deepEqual((await store.getBackup(a.id)).data,backup);
  server=createServer({store,pairings:{}});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  async function call(method,path,secret,body,extra={}){const r=await fetch(base+path,{method,headers:{authorization:`Bearer ${secret}`,'content-type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
  assert.equal((await call('GET','/backup',b.secret)).status,404);assert.equal((await call('GET','/backup',a.secret)).status,200);assert.equal((await call('PUT','/session',a.secret,{id:b.id,lease,version:2,data:payload.toString('base64')})).status,400);
  assert.equal((await call('GET','/session',a.secret,null,{'x-session-lease':lease})).body.current.version,2);
  for(let n=0;n<25;n++)await store.heartbeat(a.id,{lastError:`ERROR_${n}`},await store.authenticate(a.secret));
  assert.equal((await db.query('SELECT last_error FROM ruthless_pairing.support WHERE id=$1',[a.id])).rows[0].last_error.length,20);
  await db.query(`UPDATE ruthless_pairing.sessions SET last_used=clock_timestamp()-interval '61 days' WHERE id=$1`,[b.id]);const blease=await store.lease(b.id);assert.ok(blease);assert.equal((await store.heartbeat(b.id,{},await store.authenticate(b.secret))).unused60Days,true);assert.equal((await store.heartbeat(b.id,{},await store.authenticate(b.secret))).unused60Days,false);
  await store.release(b.id,blease.lease);await db.query(`UPDATE ruthless_pairing.sessions SET last_used=clock_timestamp()-interval '91 days' WHERE id=$1`,[b.id]);await store.cleanup();assert.equal(await store.authenticate(b.secret),null);
  assert.equal((await call('DELETE','/data',a.secret)).status,200);assert.equal(await store.authenticate(a.secret),null);assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ruthless_pairing.backups')).rows[0].n,0);
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();}
});
test('PostgreSQL + HTTP: simulated QR pairing and bot session restore', {timeout:60000},async()=>{
 const {EventEmitter}=require('node:events'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {Pairings}=require('../lib/pairing'),{PairingClient,SessionSync}=require('../../lib/pairing-client'),Database=require('../../lib/database');
 const pg=new PGlite(),store=new PostgresStore(pg,dataKey('78'.repeat(32))),dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-postgres-'));let server,sync,db,socket;const sent=[];
 try{await store.indexes();const manager=new Pairings(store,{socketFactory:opts=>{socket={ev:new EventEmitter(),user:{id:'2348012345678@s.whatsapp.net'},auth:opts.auth,end(){socket.ended=true},sendMessage:async(jid,payload)=>sent.push({jid,...payload})};return socket;}});server=createServer({store,pairings:manager});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;manager.siteUrl=base;
 const pair=await fetch(base+'/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'qr'})});assert.equal(pair.status,200);const {handle}=await pair.json();socket.ev.emit('connection.update',{qr:'sample-test-qr'});let state;for(let n=0;n<50;n++){state=await (await fetch(base+'/pair/status?handle='+handle)).json();if(state.qr)break;await new Promise(r=>setTimeout(r,10));}assert.match(state.qr,/^data:image\/png;base64,/);socket.auth.creds.registered=true;socket.ev.emit('connection.update',{connection:'open'});for(let n=0;n<100;n++){state=await (await fetch(base+'/pair/status?handle='+handle)).json();if(state.status==='delivered')break;await new Promise(r=>setTimeout(r,10));}assert.equal(state.status,'delivered');assert.equal(sent.length,2);const sessionId=sent[1].text;assert.ok(!JSON.stringify(state).includes(sessionId));assert.equal(socket.ended,true);const client=new PairingClient('',sessionId);db=await new Database('',path.join(dir,'db.json')).connect();sync=new SessionSync(client,db,{directory:path.join(dir,'session')});await sync.start();assert.equal((await db.get('auth:creds')).registered,true);
 }finally{if(sync)await sync.close({save:false}).catch(()=>{});if(db)await db.close();if(server)await new Promise(r=>server.close(r));await pg.close();await fs.rm(dir,{recursive:true,force:true});}
});
