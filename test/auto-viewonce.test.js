'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const config=require('../config'),auto=require('../lib/auto-viewonce'),media=require('../lib/media'),command=require('../commands/misc/antiviewonce'),{processIncoming}=require('../lib/group-events');
const owner='234800000000',other='234811111111@s.whatsapp.net',group='12345@g.us',otherGroup='67890@g.us';
function db(){const data=new Map();return {file:`test-${Math.random()}`,get:async(k,d)=>data.has(k)?data.get(k):d,set:async(k,v)=>data.set(k,v)};}
function socket(){const sent=[];return {sent,user:{id:`${owner}@s.whatsapp.net`},groupMetadata:async()=>({participants:[{id:other,admin:'admin'},{id:`${owner}@s.whatsapp.net`,admin:'admin'}]}),sendMessage:async(jid,body)=>{sent.push({jid,body});}};}
function msg(chat,kind='image',variant='wrapper',sender=other){const mediaItem={mimetype:kind==='audio'?'audio/ogg':`image/jpeg`,caption:'hello'};return {key:{remoteJid:chat,id:'message-1',participant:chat.endsWith('@g.us')?sender:undefined,fromMe:false},pushName:'A member',message:variant==='wrapper'?{viewOnceMessageV2:{message:{[`${kind}Message`]:mediaItem}}}:{[`${kind}Message`]:{...mediaItem,viewOnce:true}}};}
function context(d,s,chat,op,{owner:trueOwner=true}={}){const groupChat=chat.endsWith('@g.us');return {db:d,sock:s,chat,group:groupChat,owner:trueOwner,moderator:false,args:[op],msg:{key:{remoteJid:chat,participant:groupChat?other:undefined}},sender:other,reply:async(text)=>s.sendMessage(chat,{text})};}
test('owner enables per chat with notice, and other chats remain off',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket(),orig=media.download;media.download=async()=>Buffer.from('photo');
 try{
  await command.run(context(d,s,group,'on'));assert.match(s.sent[0].body.text,/sent privately.*bot owner/i);assert.match(s.sent[0].body.text,/permission/i);assert.equal(await d.get(auto.key(group)),true);
  s.sent.length=0;assert.equal(await auto.process(s,msg(group),d),true);assert.equal(s.sent.length,1);assert.equal(s.sent[0].jid,`${owner}@s.whatsapp.net`);assert.ok(Buffer.isBuffer(s.sent[0].body.image));assert.match(s.sent[0].body.caption,/A member/);
  s.sent.length=0;assert.equal(await auto.process(s,msg(otherGroup),d),false);assert.equal(s.sent.length,0);
 }finally{media.download=orig;config.ownerNumber=old;}
});
test('legacy on setting does not silently enable the new private feature or group replay',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket(),orig=media.download;let downloaded=false;media.download=async()=>{downloaded=true;return Buffer.from('x')};
 try{await d.set(`group:${group}:protection:antiviewonce`,'on');await processIncoming(s,msg(group),d);assert.equal(downloaded,false);assert.equal(s.sent.length,0);assert.notEqual(await d.get(auto.key(group),false),true);}finally{media.download=orig;config.ownerNumber=old;}
});
test('direct chats opt in independently; image/video/audio flags and wrapper forms go to owner',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket(),orig=media.download;media.download=async()=>Buffer.from('bytes');
 try{await command.run(context(d,s,other,'on'));assert.match(s.sent[0].body.text,/permission/i);s.sent.length=0;
  for(const kind of ['image','video','audio']){const before=s.sent.length;assert.equal(await auto.process(s,msg(other,kind,'flag'),d),true);const delivered=s.sent.slice(before);assert.ok(delivered.every(x=>x.jid===`${owner}@s.whatsapp.net`));assert.ok(delivered.some(x=>x.body[kind]));}
  const self=msg(other);self.key.fromMe=true;const before=s.sent.length;assert.equal(await auto.process(s,self,d),false);assert.equal(s.sent.length,before);
 }finally{media.download=orig;config.ownerNumber=old;}
});
test('only owner enables; group admins or private participant can disable',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket();
 try{await command.run(context(d,s,group,'on',{owner:false}));assert.match(s.sent.at(-1).body.text,/Only the bot owner/);assert.equal(await d.get(auto.key(group),false),false);
  await command.run(context(d,s,group,'on'));await command.run(context(d,s,group,'off',{owner:false}));assert.equal(await d.get(auto.key(group)),false);
  await command.run(context(d,s,other,'on'));await command.run(context(d,s,other,'off',{owner:false}));assert.equal(await d.get(auto.key(other)),false);
 }finally{config.ownerNumber=old;}
});
test('failed notice does not enable, size limits and missing owner fail safely',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket(),orig=media.download;let calls=0;media.download=async()=>{calls++;return Buffer.from('x')};
 try{const c=context(d,s,group,'on');c.reply=async()=>{throw Error('no notice')};await assert.rejects(command.run(c));assert.equal(await d.get(auto.key(group),false),false);
  await command.run(context(d,s,group,'on'));s.sent.length=0;const big=msg(group);big.message.viewOnceMessageV2.message.imageMessage.fileLength=auto.MAX_BYTES+1;assert.equal(await auto.process(s,big,d),false);assert.equal(calls,0);assert.equal(s.sent.length,0);
  config.ownerNumber='';assert.equal(await auto.process(s,msg(group),d),false);assert.equal(calls,0);
 }finally{config.ownerNumber=old;media.download=orig;}
});
test('turning off waits for in-flight copy and prevents later copies',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket(),orig=media.download;let release,started;const ready=new Promise(r=>started=r);media.download=async()=>{started();return new Promise(r=>{release=()=>r(Buffer.from('x'))})};
 try{await command.run(context(d,s,group,'on'));s.sent.length=0;const copy=auto.process(s,msg(group),d);await ready;const off=command.run(context(d,s,group,'off'));release();await Promise.all([copy,off]);assert.equal(await d.get(auto.key(group)),false);const n=s.sent.length;assert.equal(await auto.process(s,msg(group),d),false);assert.equal(s.sent.length,n);assert.match(s.sent.at(-1).body.text,/off/i);
 }finally{config.ownerNumber=old;media.download=orig;}
});
test('real handler lets owner enable one private chat even with remoteJidAlt',async()=>{
 const {handle}=require('../handler'),{loadCommands}=require('../lib/loader');const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket();
 try{const m={key:{remoteJid:other,remoteJidAlt:'111222333444@lid',fromMe:true,id:'owner-command'},message:{conversation:'.antiviewonce on'}};await handle(s,m,loadCommands(),d);assert.equal(await d.get(auto.key(other),false),true);assert.ok(s.sent.some(x=>x.body.text&&/Enabling view-once copying/i.test(x.body.text)));}
 finally{config.ownerNumber=old;}
});
test('incoming event copies enabled group admin media even when bot is not admin',async()=>{
 const old=config.ownerNumber;config.ownerNumber=owner;const d=db(),s=socket(),orig=media.download;media.download=async()=>Buffer.from('photo');
 s.groupMetadata=async()=>({participants:[{id:other,admin:'admin'},{id:`${owner}@s.whatsapp.net`,admin:null}]});
 try{await d.set(auto.key(group),true);await processIncoming(s,msg(group,'image','wrapper'),d);assert.equal(s.sent.length,1);assert.equal(s.sent[0].jid,`${owner}@s.whatsapp.net`);assert.ok(s.sent[0].body.image);}finally{media.download=orig;config.ownerNumber=old;}
});
