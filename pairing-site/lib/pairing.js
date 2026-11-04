'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{promisify}=require('node:util');
const {default:makeSocket,initAuthCreds,BufferJSON,proto,Browsers,DisconnectReason}=require('@whiskeysockets/baileys');
const pino=require('pino'),QRCode=require('qrcode'),{generateId}=require('./security');
const gzip=promisify(zlib.gzip),logger=pino({level:'silent'});
const encode=v=>JSON.parse(JSON.stringify(v,BufferJSON.replacer));
const decode=v=>JSON.parse(JSON.stringify(v,BufferJSON.reviver));
const WARNING='Your SESSION_ID is below. Anyone with it can control your WhatsApp. Never share it. Delete this message after you deploy.';
class Pairings{
 constructor(store,{socketFactory=makeSocket,siteUrl}={}){this.store=store;this.socketFactory=socketFactory;this.siteUrl=siteUrl;this.jobs=new Map();}
 async start(mode,phone){
  if(!['code','qr'].includes(mode)||(mode==='code'&&!/^\d{6,15}$/.test(phone||'')))throw Error('Invalid pairing request');
  if(this.jobs.size>=50)throw Error('Pairing busy');
  const handle=crypto.randomBytes(24).toString('base64url'),folder=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-pair-'));
  const job={handle,folder,status:'waiting',mode,phone,qr:null,code:null,entries:{},creds:initAuthCreds(),requested:false,done:false,sock:null};this.jobs.set(handle,job);
  job.timer=setTimeout(()=>this.finish(job,'expired').catch(()=>{}),5*60*1000);job.timer.unref();
  try{this.connect(job);}catch{await this.finish(job,'failed');throw Error('Pairing unavailable');}return handle;
 }
 connect(job){
  if(job.done)return;
  const state={creds:job.creds,keys:{get:async(type,ids)=>{const out={};for(const id of ids){const val=job.entries[`auth:key:${type}:${id}`];if(val!=null){let v=decode(val);if(type==='app-state-sync-key')v=proto.Message.AppStateSyncKeyData.fromObject(v);out[id]=v;}}return out;},set:async data=>{for(const [type,entries] of Object.entries(data))for(const [id,v] of Object.entries(entries)){const key=`auth:key:${type}:${id}`;if(v==null)delete job.entries[key];else job.entries[key]=encode(v);}}}};
  const sock=this.socketFactory({logger,auth:state,browser:Browsers.ubuntu('Chrome'),syncFullHistory:false});job.sock=sock;
  sock.ev.on('creds.update',()=>{job.entries['auth:creds']=encode(job.creds);});
  sock.ev.on('connection.update',update=>{(async()=>{
   if(job.done)return;
   if(update.qr&&job.mode==='qr')job.qr=await QRCode.toDataURL(update.qr,{margin:2,width:280});
   if(update.qr&&job.mode==='code'&&!job.requested&&!job.creds.registered){job.requested=true;await new Promise(r=>setTimeout(r,2000));if(job.done)return;const code=await sock.requestPairingCode(job.phone);if(!/^[A-Za-z0-9]{8}$/.test(code))throw Error('Invalid code');job.code=code;}
   if(update.connection==='open')await this.deliver(job,sock);
   if(update.connection==='close'&&!job.done){const code=update.lastDisconnect?.error?.output?.statusCode;if(code===DisconnectReason.restartRequired){this.connect(job);return;}await this.finish(job,'failed');}
  })().catch(()=>this.finish(job,'failed').catch(()=>{}));});
 }
 async snapshot(job){job.entries['auth:creds']=encode(job.creds);return gzip(Buffer.from(JSON.stringify({version:1,entries:job.entries})));}
 async deliver(job,sock){
  if(job.delivering||job.done)return;job.delivering=true;job.qr=null;job.code=null;
  const phone=String(sock.user?.id||'').split('@')[0].split(':')[0];
  if(!/^\d{6,15}$/.test(phone)||(job.phone&&job.phone!==phone))return this.finish(job,'failed');
  const issued=generateId(this.siteUrl);let provisioned=false;
  try{
   await this.store.provision(issued.secret,await this.snapshot(job),phone);provisioned=true;
   const send=async text=>{let last;for(let i=0;i<3;i++){try{return await sock.sendMessage(`${phone}@s.whatsapp.net`,{text});}catch(e){last=e;if(i<2)await new Promise(r=>setTimeout(r,1000*(i+1)));}}throw last;};
   await send(WARNING);await send(issued.sessionId);
   const lock=await this.store.lease(issued.id);if(!lock)throw Error('Could not lock session');
   const saved=await this.store.putSession(issued.id,lock.lease,1,await this.snapshot(job));if(!saved)throw Error('Could not save session');
   await this.store.release(issued.id,lock.lease);await this.finish(job,'delivered');
  }catch{if(provisioned)await this.store.delete(issued.id).catch(()=>{});await this.finish(job,'failed');}
 }
 async finish(job,status){if(job.done)return;job.done=true;job.status=status;job.qr=null;job.code=null;clearTimeout(job.timer);try{job.sock?.end();}catch{}await fs.rm(job.folder,{recursive:true,force:true}).catch(()=>{});job.entries={};job.creds=null;job.sock=null;setTimeout(()=>this.jobs.delete(job.handle),60000).unref();}
 status(handle){const j=this.jobs.get(handle);if(!j)return null;return {status:j.status,...(j.mode==='qr'&&j.qr?{qr:j.qr}:{}),...(j.mode==='code'&&j.code?{code:j.code}:{})};}
}
module.exports={Pairings,WARNING};
