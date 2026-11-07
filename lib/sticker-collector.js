'use strict';
// Opt-in, live-only collection. The queue is a bounded local spool, not a settings backup.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Image}=require('node-webpmux');
const {withLock}=require('./game-lock');
const media=require('./media');
const BATCH=10, MAX_BYTES=512*1024, MAX_AGE=7*86400000;
const PACK='Ruth', AUTHOR='If you can steal it 😹';
const connections=new WeakMap();
function assertActive(sock){if(connections.get(sock)?.active===false)throw Error('Sticker collection stopped');}
const key=chat=>`group:${chat}:stickercollect`;
function spoolPath(db){
 const suffix=crypto.createHash('sha256').update(String(db.tenantId||db.file)).digest('hex').slice(0,20);
 return path.join(path.dirname(db.file),`sticker-queue-${suffix}.json`);
}
function lock(db,fn){return withLock(`sticker-collector:${spoolPath(db)}`,fn);}
function privateJid(sock){
 const id=String(sock?.user?.id||'').replace(/:\d+@/,'@');
 return /^\d{6,15}@s\.whatsapp\.net$/.test(id)?id:null;
}
function visibleSticker(msg){
 if(!msg?.key?.remoteJid?.endsWith('@g.us')||!msg.key.id||!msg.message)return null;
 let m=msg.message;
 // Never unwrap view-once messages for collection.
 for(let i=0;i<4;i++){
  if(m.viewOnceMessage||m.viewOnceMessageV2||m.viewOnceMessageV2Extension)return null;
  const next=m.ephemeralMessage?.message||m.documentWithCaptionMessage?.message;
  if(!next)break;m=next;
 }
 if(m.viewOnceMessage||m.viewOnceMessageV2||m.viewOnceMessageV2Extension)return null;
 return m.stickerMessage||null;
}
async function load(db,now=Date.now()){
 let state;
 try{
  const file=spoolPath(db);const stat=await fs.stat(file);
  if(stat.size>8*1024*1024)throw Error('Sticker queue exceeds its size limit');
  state=JSON.parse(await fs.readFile(file,'utf8'));
 }catch(e){if(e.code==='ENOENT')return {items:[],delivering:false};throw e;}
 if(!state||!Array.isArray(state.items)||state.items.length>BATCH||typeof state.delivering!=='boolean')throw Error('Invalid sticker queue');
 state.items=state.items.filter(x=>x&&typeof x.group==='string'&&x.group.endsWith('@g.us')&&typeof x.data==='string'&&x.data.length<=Math.ceil(MAX_BYTES*4/3)+8&&typeof x.id==='string'&&Number.isFinite(x.at)&&x.at>now-MAX_AGE);
 if(!state.items.length)state.delivering=false;
 return state;
}
async function save(db,state){
 const file=spoolPath(db);
 if(!state.items.length){await fs.rm(file,{force:true});return;}
 await fs.mkdir(path.dirname(file),{recursive:true});
 const temp=`${file}.${process.pid}.tmp`;
 try{await fs.writeFile(temp,JSON.stringify(state),{mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}
}
async function deliver(sock,db,state){
 if(!state.delivering)return;
 const jid=privateJid(sock);if(!jid)throw Error('Linked account phone number unavailable');
 while(state.items.length){
  assertActive(sock);
  const item=state.items[0];
  // Re-check consent after restart or settings restoration, not just at collection time.
  if(!await db.get(key(item.group),false)){state.items.shift();await save(db,state);continue;}
  const buffer=Buffer.from(item.data,'base64');
  assertActive(sock);
  await sock.sendMessage(jid,{sticker:buffer,isAnimated:item.animated===true});
  // Persist progress after every accepted send. A crash between send and save may duplicate one sticker.
  state.items.shift();await save(db,state);
 }
 state.delivering=false;
}
async function collect(sock,msg,db,{download=media.download,now=Date.now()}={}){
 const sticker=visibleSticker(msg),chat=msg?.key?.remoteJid;
 if(!sticker||sticker.mimetype&&sticker.mimetype!=='image/webp'||sticker.isLottie)return false;
 if(Number(sticker.fileLength||0)>MAX_BYTES)return false;
 return lock(db,async()=>{
  assertActive(sock);
  if(!await db.get(key(chat),false))return false;
  const state=await load(db,now);await save(db,state);
  // Do not queue without a verified self destination or overflow a failed batch.
  if(!privateJid(sock))return false;
  if(state.delivering){await deliver(sock,db,state);}
  if(state.items.some(x=>x.group===chat&&x.id===msg.key.id))return false;
  const input=await download(sock,msg,{maxBytes:MAX_BYTES});
  if(!Buffer.isBuffer(input)||input.length>MAX_BYTES)return false;
  // webpmux validates WebP and preserves animation when only EXIF is changed.
  const probe=new Image();await probe.load(input);
  if(probe.width!==512||probe.height!==512)return false;
  const output=await media.withExif(input,PACK,AUTHOR);
  if(output.length>MAX_BYTES)return false;
  state.items.push({group:chat,id:msg.key.id,at:now,animated:probe.hasAnim===true,data:output.toString('base64')});
  if(state.items.length===BATCH)state.delivering=true;
  await save(db,state);
  if(state.delivering)await deliver(sock,db,state);
  return true;
 });
}
async function resume(sock,db){return lock(db,async()=>{const state=await load(db);await save(db,state);if(state.delivering)await deliver(sock,db,state);});}
async function enableGroup(db,chat,announce){return lock(db,async()=>{
 if(await db.get(key(chat),false))return false;
 await announce();await db.set(key(chat),true);return true;
});}
async function stopGroup(db,chat){return lock(db,async()=>{
 await db.set(key(chat),false);
 const state=await load(db);state.items=state.items.filter(x=>x.group!==chat);if(!state.items.length)state.delivering=false;await save(db,state);
});}
async function status(db,chat){return lock(db,async()=>{const state=await load(db);await save(db,state);return {enabled:!!await db.get(key(chat),false),groupPending:state.items.filter(x=>x.group===chat).length,totalPending:state.items.length,delivering:state.delivering};});}
function start(sock,db,{intervalMs=60000}={}){
 const connection={active:true};connections.set(sock,connection);
 const run=()=>resume(sock,db).catch(()=>{if(connection.active)console.warn('Sticker batch delivery pending; will retry.');});
 void run();const timer=setInterval(run,intervalMs);timer.unref?.();return()=>{connection.active=false;clearInterval(timer);};
}
module.exports={BATCH,MAX_BYTES,MAX_AGE,PACK,AUTHOR,key,spoolPath,privateJid,visibleSticker,collect,resume,enableGroup,stopGroup,status,start};
