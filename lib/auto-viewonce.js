'use strict';
// Explicit per-chat consent only. Old group anti-view-once settings are ignored.
const config=require('../config');
const media=require('./media');
const {inner}=require('./group');
const {withLock}=require('./game-lock');
const MAX_BYTES=20*1024*1024, MAX_ACTIVE=3;
let active=0;
function validChat(chat){return typeof chat==='string'&&(/^[^@]{1,120}@g\.us$/.test(chat)||/^\d{6,20}@(s\.whatsapp\.net|lid)$/.test(chat));}
function key(chat){return `antiviewonce:private:v2:${chat}`;}
function lock(db,chat,fn){return withLock(`auto-viewonce:${String(db.tenantId||db.file||'local')}:${chat}`,fn);}
function isViewOnce(m){
 for(let i=0;i<6&&m;i++){
  if(m.viewOnceMessage||m.viewOnceMessageV2||m.viewOnceMessageV2Extension)return true;
  if(m.imageMessage?.viewOnce||m.videoMessage?.viewOnce||m.audioMessage?.viewOnce)return true;
  m=m.ephemeralMessage?.message||m.documentWithCaptionMessage?.message;
 }
 return false;
}
function cleanText(s,max){return String(s||'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
async function process(sock,msg,db){
 const chat=msg?.key?.remoteJid;
 if(!validChat(chat)||!msg?.key?.id||msg.key.fromMe||!isViewOnce(msg.message))return false;
 const content=inner(msg.message), item=content.imageMessage||content.videoMessage||content.audioMessage;
 if(!item||Number(item.fileLength||0)>MAX_BYTES)return false;
 // Limit concurrent work instead of allowing an unbounded queue or memory use.
 if(active>=MAX_ACTIVE){console.warn('Automatic view-once copy skipped: busy.');return false;}
 active++;
 try{return await lock(db,chat,async()=>{
  if(await db.get(key(chat),false)!==true)return false;
  if(!/^\d{6,15}$/.test(config.ownerNumber))return false;
  const recipient=`${config.ownerNumber}@s.whatsapp.net`;
  const bytes=await media.download(sock,msg,{maxBytes:MAX_BYTES});
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX_BYTES)return false;
  // Stop and send share the same per-chat lock so a completed off command
  // cannot be followed by a copy already waiting inside this process.
  if(await db.get(key(chat),false)!==true)return false;
  const sender=cleanText(msg.pushName,80)||cleanText(msg.key.participant||chat,100)||'Unknown';
  const origin=chat.endsWith('@g.us')?'Group':'Private chat';
  const caption=cleanText(item.caption,900),label=`👁️ View-once copy\nFrom: ${sender}\nSource: ${origin} (${cleanText(chat,120)})${caption?'\nCaption: '+caption:''}`;
  if(content.imageMessage)await sock.sendMessage(recipient,{image:bytes,caption:label});
  else if(content.videoMessage)await sock.sendMessage(recipient,{video:bytes,caption:label});
  else {await sock.sendMessage(recipient,{text:label});await sock.sendMessage(recipient,{audio:bytes,mimetype:item.mimetype||'audio/ogg',ptt:!!item.ptt});}
  return true;
 });}catch{console.warn('Automatic view-once copy failed; media may be unavailable.');return false;}finally{active--;}
}
module.exports={MAX_BYTES,MAX_ACTIVE,validChat,key,lock,isViewOnce,process};
