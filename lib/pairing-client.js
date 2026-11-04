'use strict';
const crypto=require('node:crypto'),path=require('node:path');
const archive=require('./session-archive');
const SESSION=/^RUTHLESS~([a-f0-9]{32})(?:\.([A-Za-z0-9_-]{1,512}))?~([A-Za-z0-9_-]{43})$/;
function normalizeOrigin(value){let u;try{u=new URL(value);}catch{throw Error('Set PAIRING_API_URL to a trusted HTTPS origin');}if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('Set PAIRING_API_URL to a trusted HTTPS origin');return u.origin;}
function parseShortSession(value){const m=SESSION.exec(value||'');if(!m){if(/^RUTHLESS~[^~]*~/.test(value||''))throw new PairingError('Session expired',401);return null;}const id=crypto.createHash('sha256').update(m[3]).digest('hex').slice(0,32);if(id!==m[1])throw Error('Invalid short SESSION_ID');let origin='';if(m[2]){const raw=Buffer.from(m[2],'base64url');if(raw.toString('base64url')!==m[2])throw Error('Invalid session origin');origin=normalizeOrigin(raw.toString('utf8'));}return {id,secret:m[3],origin};}
class PairingError extends Error {constructor(message,status=0){super(message);this.status=status;}}
class PairingClient{
 constructor(url,sessionId,{fetchFn=fetch}={}){this.credentials=parseShortSession(sessionId);if(!this.credentials)throw Error('Invalid short SESSION_ID');this.url=new URL(normalizeOrigin(url||this.credentials.origin));this.fetch=fetchFn;this.lease=null;}
 async request(method,route,data,extra={}){let response;try{response=await this.fetch(new URL(route,this.url),{method,headers:{authorization:`Bearer ${this.credentials.secret}`,...(data?{'content-type':'application/json'}:{}),...extra},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new PairingError('Pairing server unreachable');}if(!response.ok){await response.body?.cancel();throw new PairingError(response.status===401?'Session expired':response.status===409?'Session in use or changed':'Pairing service request failed',response.status);}const {boundedBody}=require('./public-files');try{return JSON.parse((await boundedBody(response,15*1024*1024)).toString('utf8'));}catch{throw new PairingError('Invalid pairing service response');}}
 async acquire(){const result=await this.request('POST','/session',{action:'acquire'});if(!/^[\w-]{43}$/.test(result.lease||'')||result.durationMs<60000||result.durationMs>120000)throw new PairingError('Invalid lease');this.lease=result.lease;return result;}
 renew(){return this.request('POST','/session',{action:'renew',lease:this.lease});}
 async release(){if(this.lease){const lease=this.lease;this.lease=null;return this.request('POST','/session',{action:'release',lease});}}
 getSession(){return this.request('GET','/session',null,{'x-session-lease':this.lease});}
 saveSession(version,data){return this.request('PUT','/session',{lease:this.lease,version,data:data.toString('base64')});}
 getBackup(){return this.request('GET','/backup');}
 saveBackup(version,data){return this.request('PUT','/backup',{version,data:data.toString('base64')});}
 heartbeat(data){return this.request('POST','/heartbeat',data);}
 deleteData(){return this.request('DELETE','/data');}
}
async function acquireWithRetry(client,{delay=ms=>new Promise(r=>setTimeout(r,ms)),onContention=()=>{},maxContentionRetries=36}={}){
 let networkFailures=0,contention=0,last;
 for(;;){try{return await client.acquire();}catch(e){last=e;if(e.status===401)throw e;
  if(e.status===409){if(contention++>=maxContentionRetries)throw last;if(contention===1)onContention();await delay(5000);continue;}
  if(++networkFailures>=3)throw last;await delay(1000*networkFailures);
 }}
}
class SessionSync{
 constructor(client,db,{directory=path.join(__dirname,'../session',client.credentials.id),onLost=()=>{},onError=()=>{},onContention=()=>{},now=()=>Date.now()}={}){this.client=client;this.db=db;this.directory=directory;this.onLost=onLost;this.onError=onError;this.onContention=onContention;this.now=now;this.version=0;this.timer=null;this.renewTimer=null;this.inFlight=Promise.resolve();this.closed=false;this.generation=0;this.leaseLost=false;}
 async start(){
  await acquireWithRetry(this.client,{onContention:this.onContention});
  this.renewTimer=setInterval(()=>this.client.renew().catch(()=>{if(this.leaseLost)return;this.leaseLost=true;this.onError('SESSION_LEASE_LOST');this.stopTimers();this.onLost();}),30000);this.renewTimer.unref();
  try { let remote;
  try{remote=await this.client.getSession();}catch(e){await this.client.release().catch(()=>{});throw e;}
  if(!remote?.current||!Number.isSafeInteger(remote.current.version)||remote.current.version<1)throw new PairingError('Session expired',401);
  this.version=remote.current.version;let remoteArchive=Buffer.from(remote.current.data||'','base64'),chosen,repair=false;
  try{chosen=await archive.unpack(remoteArchive);}catch(e){if(!remote.previous)throw new PairingError('Session expired',401);remoteArchive=Buffer.from(remote.previous.data||'','base64');try{chosen=await archive.unpack(remoteArchive);repair=true;}catch{throw new PairingError('Session expired',401);}}
  let local;try{local=await archive.readLocal(this.directory);}catch{local=null;}
  if(local&&local.revision===this.version&&Date.parse(local.updatedAt)>Date.parse(remote.current.updatedAt)){chosen=await archive.unpack(local.archive);remoteArchive=local.archive;repair=true;}
  if(chosen.entries['auth:creds']?.registered !== true)throw new PairingError('Session expired',401);
  if(repair){const saved=await this.client.saveSession(this.version,remoteArchive);this.version=saved.version;await archive.writeLocal(this.directory,remoteArchive,this.version,saved.updatedAt);}else await archive.writeLocal(this.directory,remoteArchive,this.version,remote.current.updatedAt);
  for(const [key] of await this.db.list('auth:'))await this.db.del(key);
  for(const [key,value] of Object.entries(chosen.entries))await this.db.set(key,value);
  if (this.leaseLost) throw new PairingError('Session lease lost',409);
  } catch(e) { this.stopTimers(); await this.client.release().catch(()=>{}); throw e; }
 }
 changed(){if(this.closed)return;this.generation++;if(this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(e=>{if(e.status===401||e.status===409){this.leaseLost=true;this.onError('SESSION_LEASE_LOST');this.stopTimers();this.onLost();return;}this.onError('SESSION_SYNC_FAILED');console.error('Session sync failed; local snapshot retained. Will retry.');this.changed();});},45000);this.timer.unref();}
 async flush(){this.inFlight=this.inFlight.catch(()=>{}).then(async()=>{const generation=this.generation;const entries=Object.fromEntries(await this.db.list('auth:'));const packed=await archive.pack(entries);await archive.writeLocal(this.directory,packed,this.version,new Date(this.now()).toISOString());const saved=await this.client.saveSession(this.version,packed);if(!Number.isSafeInteger(saved.version)||saved.version<=this.version||!Number.isFinite(Date.parse(saved.updatedAt)))throw new PairingError('Invalid session save response');this.version=saved.version;await archive.writeLocal(this.directory,packed,this.version,saved.updatedAt);if(generation!==this.generation)this.changed();});return this.inFlight;}
 stopTimers(){clearTimeout(this.timer);clearInterval(this.renewTimer);}
 async close({save=true}={}){if(this.closed)return;this.closed=true;this.stopTimers();try{if(save)await this.flush();}finally{await this.client.release().catch(()=>{});}}
}
module.exports={parseShortSession,PairingClient,PairingError,SessionSync,acquireWithRetry};
