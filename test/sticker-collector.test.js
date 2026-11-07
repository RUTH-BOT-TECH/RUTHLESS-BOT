'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const sharp=require('sharp');
const {Image}=require('node-webpmux');
const collector=require('../lib/sticker-collector');
const Database=require('../lib/database');
const group='12345@g.us',other='67890@g.us',self='2348000000000@s.whatsapp.net';
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruth-stickers-'));
 const db=await new Database('',path.join(dir,'db.json')).connect(),sent=[];
 const sock={user:{id:'2348000000000:7@s.whatsapp.net'},sendMessage:async(jid,content)=>{sent.push({jid,content});}};
 const staticSticker=await sharp({create:{width:512,height:512,channels:4,background:'#f00'}}).webp().toBuffer();
 const msg=(id,chat=group)=>({key:{id,remoteJid:chat,participant:'2348111111111@s.whatsapp.net'},message:{stickerMessage:{mimetype:'image/webp'}}});
 const download=async()=>staticSticker;
 return {dir,db,sock,sent,staticSticker,msg,download,close:async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});}};
}
test('opt-in collects live group stickers and sends exactly ten renamed stickers to linked account',async()=>{
 const f=await fixture();try{
  assert.equal(await collector.collect(f.sock,f.msg('ignored'),f.db,{download:f.download}),false);
  await f.db.set(collector.key(group),true);
  const first=f.msg('once');first.message={viewOnceMessage:{message:first.message}};
  assert.equal(await collector.collect(f.sock,first,f.db,{download:f.download}),false);
  await Promise.all(Array.from({length:9},(_,i)=>collector.collect(f.sock,f.msg(`id${i}`),f.db,{download:f.download})));
  assert.equal(f.sent.length,0);assert.equal((await collector.status(f.db,group)).groupPending,9);
  assert.equal(await collector.collect(f.sock,f.msg('id0'),f.db,{download:f.download}),false);
  await collector.collect(f.sock,f.msg('id9'),f.db,{download:f.download});
  assert.equal(f.sent.length,10);assert.ok(f.sent.every(x=>x.jid===self&&x.content.isAnimated===false));
  const image=new Image();await image.load(f.sent[0].content.sticker);assert.match(image.exif.toString(),/Ruth/);assert.match(image.exif.toString(),/If you can steal it/);
  assert.equal((await collector.status(f.db,group)).totalPending,0);await assert.rejects(fs.stat(collector.spoolPath(f.db)),{code:'ENOENT'});
 }finally{await f.close();}
});
test('failed partial delivery remains queued and resumes without resending accepted stickers',async()=>{
 const f=await fixture();try{
  await f.db.set(collector.key(group),true);
  for(let i=0;i<9;i++)await collector.collect(f.sock,f.msg(`id${i}`),f.db,{download:f.download});
  let attempts=0;f.sock.sendMessage=async(jid,content)=>{if(++attempts===4)throw Error('network');f.sent.push({jid,content});};
  await assert.rejects(collector.collect(f.sock,f.msg('id9'),f.db,{download:f.download}));
  assert.equal(f.sent.length,3);let s=await collector.status(f.db,group);assert.equal(s.totalPending,7);assert.equal(s.delivering,true);
  f.sock.sendMessage=async(jid,content)=>f.sent.push({jid,content});await collector.resume(f.sock,f.db);
  assert.equal(f.sent.length,10);assert.equal((await collector.status(f.db,group)).totalPending,0);
 }finally{await f.close();}
});
test('disabling one group removes its pending stickers without touching another group',async()=>{
 const f=await fixture();try{
  await f.db.set(collector.key(group),true);await f.db.set(collector.key(other),true);
  await collector.collect(f.sock,f.msg('a'),f.db,{download:f.download});await collector.collect(f.sock,f.msg('b',other),f.db,{download:f.download});
  await collector.stopGroup(f.db,group);assert.equal((await collector.status(f.db,group)).enabled,false);assert.equal((await collector.status(f.db,other)).groupPending,1);
  assert.equal(await collector.collect(f.sock,f.msg('c'),f.db,{download:f.download}),false);
 }finally{await f.close();}
});
test('expired items are discarded; missing self number and invalid content fail closed',async()=>{
 const f=await fixture();try{
  await f.db.set(collector.key(group),true);
  await collector.collect(f.sock,f.msg('old'),f.db,{download:f.download,now:Date.now()-collector.MAX_AGE-1});
  assert.equal((await collector.status(f.db,group)).totalPending,0);
  const noJid={user:{id:'123@lid'},sendMessage:f.sock.sendMessage};assert.equal(await collector.collect(noJid,f.msg('no'),f.db,{download:f.download}),false);
  const invalid=f.msg('lottie');invalid.message.stickerMessage.isLottie=true;assert.equal(await collector.collect(f.sock,invalid,f.db,{download:f.download}),false);
  const badSize=f.msg('big');badSize.message.stickerMessage.fileLength=collector.MAX_BYTES+1;assert.equal(await collector.collect(f.sock,badSize,f.db,{download:f.download}),false);
 }finally{await f.close();}
});
test('animated WebP stays animated after metadata replacement and is flagged in sends', {timeout:30000},async()=>{
 const f=await fixture();try{
  const anim=await require('../lib/text-sticker').animated('Hi');const before=await sharp(anim,{animated:true}).metadata();assert.ok(before.pages>1);
  await f.db.set(collector.key(group),true);
  for(let i=0;i<10;i++)await collector.collect(f.sock,f.msg(`a${i}`),f.db,{download:async()=>anim});
  assert.equal(f.sent.length,10);assert.ok(f.sent.every(x=>x.content.isAnimated));
  const after=await sharp(f.sent[0].content.sticker,{animated:true}).metadata();assert.equal(after.pages,before.pages);
 }finally{await f.close();}
});
test('group command only owner enables, group notice precedes enabling, admin can switch off',async()=>{
 const f=await fixture(),cmd=require('../commands/group/stickercollect');try{
  const messages=[];const ctx={db:f.db,chat:group,args:['on'],owner:false,reply:async s=>messages.push(s)};
  await cmd.run(ctx);assert.match(messages.pop(),/Only the bot owner/);assert.equal(await f.db.get(collector.key(group),false),false);
  ctx.owner=true;ctx.reply=async s=>{assert.equal(await f.db.get(collector.key(group),false),false);messages.push(s);};await cmd.run(ctx);
  assert.match(messages.at(-1),/temporarily stored/);assert.equal(await f.db.get(collector.key(group),false),true);
  ctx.owner=false;ctx.args=['off'];ctx.reply=async s=>messages.push(s);await cmd.run(ctx);assert.equal(await f.db.get(collector.key(group),false),false);
 }finally{await f.close();}
});
