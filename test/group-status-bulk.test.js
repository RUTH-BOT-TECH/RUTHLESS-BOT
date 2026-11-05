'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const [opt,bulk]=require('../commands/group/group-status-bulk'),status=require('../lib/group-status'),media=require('../lib/media');
const OWNER='234800000009@s.whatsapp.net',ADMIN='234800000008@s.whatsapp.net',OTHER='234800000007@s.whatsapp.net',BOT='234800000010@s.whatsapp.net',A='120363100000001@g.us',B='120363100000002@g.us',C='120363100000003@g.us';
function setup(){
 const values=new Map(),out=[],sent=[],joined={[A]:{},[B]:{},[C]:{}},db={get:async(k,f)=>values.has(k)?values.get(k):f,set:async(k,v)=>values.set(k,v),del:async k=>values.delete(k),list:async pre=>[...values].filter(([k])=>k.startsWith(pre))};
 const sock={user:{id:BOT},groupFetchAllParticipating:async()=>joined,groupMetadata:async jid=>({id:jid,participants:[{id:BOT},{id:ADMIN,admin:'admin'},{id:OWNER},{id:OTHER}]})};
 const ctx=(sender=OWNER,chat=OWNER)=>({sender,chat,group:chat.endsWith('@g.us'),owner:sender===OWNER,moderator:false,db,sock,args:[],msg:{key:{remoteJid:chat,participant:sender},message:{conversation:'.gpostall'}},reply:async t=>out.push(t)});
 return {values,out,sent,joined,db,sock,ctx};
}
const token=t=>/confirm ([a-f0-9]{12})/.exec(t)?.[1];
async function optin(x,id){const ctx=x.ctx(ADMIN,id);ctx.args=['in'];await opt.run(ctx);}
test('group status opt-in requires a real group admin, and opts out cleanly',async()=>{
 const x=setup();let c=x.ctx(OTHER,A);c.args=['in'];await opt.run(c);assert.equal(x.values.size,0);assert.match(x.out.at(-1),/admin/i);
 c=x.ctx(OWNER,A);c.args=['in'];await opt.run(c);assert.equal(x.values.size,0);assert.match(x.out.at(-1),/WhatsApp group admin/);
 await optin(x,A);assert.equal(x.values.get('groupstatus:optin:'+A),true);
 c=x.ctx(ADMIN,A);c.args=['out'];await opt.run(c);assert.equal(x.values.has('groupstatus:optin:'+A),false);
});
test('only verified owner in own private chat can prepare and confirmation sends to opted-in joined groups',async()=>{
 const x=setup(),old=status.send;status.send=async(_s,id,text)=>x.sent.push([id,text]);
 try{
  await optin(x,A);await optin(x,B);x.values.set('groupstatus:optin:120363199999999@g.us',true);
  let c=x.ctx(OTHER,OTHER);c.args=['hello'];await bulk.run(c);assert.match(x.out.at(-1),/verified owner private/);
  c=x.ctx(OWNER,A);c.args=['hello'];await bulk.run(c);assert.match(x.out.at(-1),/verified owner private/);
  c=x.ctx(OWNER,OTHER);c.args=['hello'];await bulk.run(c);assert.match(x.out.at(-1),/verified owner private/);
  c=x.ctx();c.args=['hello','everyone'];await bulk.run(c);assert.equal(x.sent.length,0);assert.match(x.out.at(-1),/2 opted-in joined groups/);const code=token(x.out.at(-1));assert.ok(code);
  c.args=['confirm','bad'];await bulk.run(c);assert.equal(x.sent.length,0);
  c.args=['confirm',code];await bulk.run(c);assert.deepEqual(x.sent,[[A,'hello everyone'],[B,'hello everyone']]);assert.match(x.out.at(-1),/2 submitted/);assert.match(x.out.at(-1),/not proof of delivery/);
  await bulk.run(c);assert.equal(x.sent.length,2);assert.match(x.out.at(-1),/expired/);
 }finally{status.send=old;}
});
test('consent and membership are rechecked after preview; uncertain requests are not retried',async()=>{
 const x=setup(),old=status.send;status.send=async(_s,id)=>{x.sent.push(id);throw Error('uncertain transport');};
 try{
  await optin(x,A);await optin(x,B);const c=x.ctx();c.args=['hello'];await bulk.run(c);const code=token(x.out.at(-1));
  x.values.delete('groupstatus:optin:'+A);c.args=['confirm',code];await bulk.run(c);assert.deepEqual(x.sent,[B]);assert.match(x.out.at(-1),/1 uncertain, 1 skipped/);assert.match(x.out.at(-1),/may still appear/);
  await optin(x,A);c.args=['again'];await bulk.run(c);const next=token(x.out.at(-1));delete x.joined[A];delete x.joined[B];c.args=['confirm',next];await bulk.run(c);assert.equal(x.sent.length,1);assert.match(x.out.at(-1),/2 skipped/);
 }finally{status.send=old;}
});
test('image preparation is private, uses confirmation, and rejects view-once media',async()=>{
 const x=setup(),old={download:media.download,send:status.sendMedia};
 try{
  await optin(x,A);const image=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).jpeg().toBuffer();media.download=async()=>image;status.sendMedia=async(_s,id,type,data,caption)=>x.sent.push({id,type,data,caption});
  const c=x.ctx();c.args=['photo','caption'];c.msg.message={extendedTextMessage:{text:'.gpostall photo caption',contextInfo:{quotedMessage:{imageMessage:{mimetype:'image/jpeg'}},stanzaId:'abc'}}};
  await bulk.run(c);const code=token(x.out.at(-1));assert.ok(code);assert.equal(x.sent.length,0);c.args=['confirm',code];await bulk.run(c);assert.equal(x.sent.length,1);assert.equal(x.sent[0].type,'image');assert.equal(x.sent[0].caption,'photo caption');
  c.args=[];c.msg.message.extendedTextMessage.contextInfo.quotedMessage={viewOnceMessage:{message:{imageMessage:{}}}};await bulk.run(c);assert.equal(x.sent.length,1);assert.match(x.out.at(-1),/View-once/);
 }finally{media.download=old.download;status.sendMedia=old.send;}
});
test('invalid media, too many groups, cancellation and membership lookup failure send nothing',async()=>{
 const x=setup(),c=x.ctx();c.args=['hello'];await bulk.run(c);assert.match(x.out.at(-1),/No joined groups/);
 for(let i=1;i<=51;i++){const id=`1203631${String(i).padStart(8,'0')}@g.us`;x.joined[id]={};x.values.set('groupstatus:optin:'+id,true);}await bulk.run(c);assert.match(x.out.at(-1),/More than 50/);
 x.values.clear();await optin(x,A);c.args=['hello'];await bulk.run(c);const code=token(x.out.at(-1));c.args=['cancel'];await bulk.run(c);c.args=['confirm',code];await bulk.run(c);assert.match(x.out.at(-1),/expired/);
 c.args=['hello'];x.sock.groupFetchAllParticipating=async()=>{throw Error('offline')};await bulk.run(c);assert.match(x.out.at(-1),/Could not verify/);assert.equal(x.sent.length,0);
});
