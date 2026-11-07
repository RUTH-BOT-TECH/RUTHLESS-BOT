'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const sharp=require('sharp');
const Database=require('../lib/database'),c=require('../lib/sticker-collector');
test('a restored or changed disabled group is checked before pending delivery',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruth-sticker-revoke-')),db=await new Database('',path.join(dir,'db.json')).connect();
 const group='123@g.us',sent=[];let failing=true;
 const sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(j,p)=>{if(failing)throw Error('offline');sent.push({j,p});}};
 try{
  const data=await sharp({create:{width:512,height:512,channels:4,background:'red'}}).webp().toBuffer();
  await db.set(c.key(group),true);
  for(let i=0;i<10;i++){
   const msg={key:{id:String(i),remoteJid:group},message:{stickerMessage:{mimetype:'image/webp'}}};
   try{await c.collect(sock,msg,db,{download:async()=>data});}catch(e){if(i!==9)throw e;}
  }
  assert.equal((await c.status(db,group)).totalPending,10);
  await db.set(c.key(group),false);failing=false;await c.resume(sock,db);
  assert.equal(sent.length,0);assert.equal((await c.status(db,group)).totalPending,0);
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('stopping the connection prevents remaining batch sends',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruth-sticker-stop-')),db=await new Database('',path.join(dir,'db.json')).connect();
 const group='123@g.us',sent=[];let stop;
 const sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(j,p)=>{sent.push({j,p});stop();}};
 try{
  const data=await sharp({create:{width:512,height:512,channels:4,background:'red'}}).webp().toBuffer();
  await db.set(c.key(group),true);stop=c.start(sock,db,{intervalMs:3600000});
  for(let i=0;i<10;i++){
   const msg={key:{id:String(i),remoteJid:group},message:{stickerMessage:{mimetype:'image/webp'}}};
   try{await c.collect(sock,msg,db,{download:async()=>data});}catch(e){if(i!==9)throw e;}
  }
  assert.equal(sent.length,1);assert.equal((await c.status(db,group)).totalPending,9);
 }finally{stop?.();await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
