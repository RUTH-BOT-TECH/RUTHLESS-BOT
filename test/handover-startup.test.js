'use strict';
// Real child process and HTTP pairing transport with a simulated WhatsApp socket.
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),net=require('node:net'),{once}=require('node:events'),{spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {generateId}=require('../pairing-site/lib/security'),archive=require('../lib/session-archive');
function waitForLine(stream,needle,timeout=20000){return new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>finish(Error(`Timed out waiting for ${needle}`)),timeout);function finish(e){clearTimeout(timer);stream.off('data',onData);e?reject(e):resolve();}function onData(chunk){text+=chunk.toString();if(text.includes(needle))finish();}stream.on('data',onData);});}
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('new bot binds readiness while lease is held, then connects after the old copy releases', {timeout:35000},async()=>{
 const packed=await archive.pack({'auth:creds':{registered:true,me:{id:'2348011111111@s.whatsapp.net'}}});let held=true,acquired=false,backupFetched=false,backups=0,revision=1;
 const backend=http.createServer(async(req,res)=>{
  let data='';for await(const c of req)data+=c;const body=data?JSON.parse(data):{};
  const json=(code,obj)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(obj));};
  if(req.url==='/backup'&&req.method==='GET'){backupFetched=true;return json(404,{error:'No backup'});}
  if(req.url==='/backup'&&req.method==='PUT')return json(200,{version:++backups,updatedAt:new Date().toISOString()});
  if(req.url==='/session'&&req.method==='GET')return json(200,{current:{version:revision,updatedAt:new Date().toISOString(),data:packed.toString('base64')},previous:null});
  if(req.url==='/session'&&req.method==='PUT')return json(200,{version:++revision,updatedAt:new Date().toISOString()});
  if(req.url==='/session'&&body.action==='acquire'){if(held)return json(409,{error:'Session unavailable or in use'});held=true;acquired=true;return json(200,{lease:crypto.randomBytes(32).toString('base64url'),durationMs:90000});}
  if(req.url==='/session'&&body.action==='release'){held=false;return json(200,{ok:true});}
  return json(400,{error:'Unexpected request'});
 });
 backend.listen(0,'127.0.0.1');await once(backend,'listening');const origin=`http://127.0.0.1:${backend.address().port}`,session=generateId(origin),port=await freePort(),project=path.join(__dirname,'..');
 const dataFile=path.join(project,'database',`data-${session.id}.json`),sessionDir=path.join(project,'session',session.id);
 let child;
 try{
  child=spawn(process.execPath,['--require',path.join(__dirname,'fixtures/mock-baileys-startup.js'),path.join(project,'index.js')],{cwd:project,env:{...process.env,OWNER_NUMBER:'2348012222222',SESSION_ID:session.sessionId,PORT:String(port),DATABASE_URL:'',DATA_SERVICE_URL:'',PAIRING_API_URL:'',PAIRING_SITE_URL:'',HEARTBEAT:'off',TEST_CONNECTION_NOTICE:'1'},stdio:['ignore','pipe','pipe']});
  const readyLog=waitForLine(child.stdout,'Health server listening'),connectedLog=waitForLine(child.stdout,'WhatsApp connected.'),noticeLog=waitForLine(child.stdout,'Mock connection notice: 2348012222222@s.whatsapp.net');let stderr='';child.stderr.on('data',b=>stderr+=b);
  await readyLog;const base=`http://127.0.0.1:${port}`;assert.equal((await fetch(base+'/ready')).status,200);assert.equal((await fetch(base+'/health')).status,503);assert.equal(acquired,false);assert.equal(backupFetched,false,'backup must restore after exclusive handover');
  held=false;await connectedLog;await noticeLog;assert.equal(acquired,true);assert.equal(backupFetched,true);assert.equal((await fetch(base+'/health')).status,200);
  child.kill('SIGTERM');const [code]=await once(child,'exit');assert.equal(code,0,stderr);
 }finally{
  if(child&&child.exitCode===null){child.kill('SIGKILL');await once(child,'exit').catch(()=>{});}
  backend.closeAllConnections?.();await new Promise(r=>backend.close(r));await fs.rm(dataFile,{force:true});await fs.rm(`${dataFile}.settings-meta`,{force:true});await fs.rm(sessionDir,{recursive:true,force:true});
 }
});
