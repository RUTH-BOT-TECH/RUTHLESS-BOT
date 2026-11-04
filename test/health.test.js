'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{createHealth}=require('../lib/health');
test('readiness opens for safe handover while health remains disconnected until WhatsApp connects',async()=>{
 const health=createHealth({port:0,host:'127.0.0.1',log:()=>{}});
 try{health.start();await once(health.server,'listening');const base=`http://127.0.0.1:${health.server.address().port}`;
  let r=await fetch(base+'/ready');assert.equal(r.status,200);assert.equal((await r.json()).ready,true);
  r=await fetch(base+'/health');assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
  health.setConnected(true);r=await fetch(base+'/health');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
  health.setConnected(false);health.markNotReady();assert.equal((await fetch(base+'/ready')).status,503);assert.equal((await fetch(base+'/health')).status,503);
 }finally{health.close();}
});
