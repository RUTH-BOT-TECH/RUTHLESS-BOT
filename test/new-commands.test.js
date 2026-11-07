'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const {loadCommands}=require('../lib/loader'),{handle}=require('../handler'),Database=require('../lib/database'),config=require('../config'),reaction=require('../lib/tickle'),screens=require('../lib/screenshot'),media=require('../lib/media');
const user='2348012345678@s.whatsapp.net',person='2348087654321@s.whatsapp.net',group='123456789@g.us';
async function setup(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruth-new-')),db=await new Database('',path.join(dir,'db.json')).connect(),sent=[];const sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(jid,payload)=>sent.push({jid,payload})};return {db,sent,sock,async close(){await db.close();await fs.rm(dir,{recursive:true,force:true});}};}
function msg(text,{target,quoted,chat=user,id='id1'}={}){return {key:{remoteJid:chat,...(chat.endsWith('@g.us')?{participant:user}:{})},message:{extendedTextMessage:{text,contextInfo:{...(target?{mentionedJid:[target]}:{}),...(quoted?{quotedMessage:quoted,stanzaId:id,participant:person}:{})}}}};}
test('reaction commands use a documented provider, targets, solo mode and fallback',async()=>{const x=await setup(),old=reaction.gif;try{let called=[];reaction.gif=async name=>{called.push(name);return Buffer.from('mp4')};const c=loadCommands();assert.ok(c.has('hug')&&c.has('kiss')&&c.has('eat')&&c.has('drink')&&c.has('angry'));assert.equal(c.has('cook'),false);
 await handle(x.sock,msg('.hug',{target:person}),c,x.db);let p=x.sent.at(-1).payload;assert.equal(called.at(-1),'hug');assert.equal(p.gifPlayback,true);assert.deepEqual(p.mentions,[user,person]);assert.match(p.caption,/hugged/);assert.doesNotMatch(p.caption,/Source:|OtakuGIFs|Fetching/i);assert.equal(x.sent.length,1);
 await handle(x.sock,msg('.kiss'),c,x.db);assert.match(x.sent.at(-1).payload.text,/mention someone/);assert.equal(called.length,1);
 await handle(x.sock,msg('.dance'),c,x.db);assert.equal(called.at(-1),'dance');assert.deepEqual(x.sent.at(-1).payload.mentions,[user]);
 reaction.gif=async()=>{throw Error('provider offline')};await handle(x.sock,msg('.pat',{target:person}),c,x.db);assert.match(x.sent.at(-1).payload.text,/Reaction unavailable/);
 }finally{reaction.gif=old;await x.close();}});
test('screenshot validates URLs, rejects private hosts and returns clear provider failures',async()=>{
 for(const u of ['file:///etc/passwd','https://user:pass@example.com','https://example.com:8080','https://example.com/#fragment'])assert.throws(()=>screens.parseUrl(u));
 assert.equal(screens.parseUrl('example.com').protocol,'https:');await assert.rejects(screens.capture('http://127.0.0.1'),/Blocked/);
});
test('screenshot command sends an actual PNG result and labels the provider',async()=>{const x=await setup(),old=screens.capture;try{let url;const png=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).png().toBuffer();screens.capture=async v=>{url=v;return png};const c=loadCommands();await handle(x.sock,msg('.ss https://example.com'),c,x.db);assert.equal(url,'https://example.com');assert.match(x.sent[0].payload.text,/public URL to Thum.io/);assert.ok(x.sent.at(-1).payload.image.equals(png));assert.match(x.sent.at(-1).payload.caption,/Thum.io/);
 }finally{screens.capture=old;await x.close();}});
test('view-once commands require a quoted view-once message and send to the requested destination',async()=>{const x=await setup(),old=media.download,owner=config.ownerNumber;try{config.ownerNumber='2348000000001';media.download=async(_sock,source)=>{assert.equal(source.key.id,'id1');return Buffer.from('image-data')};const c=loadCommands();const photo={viewOnceMessageV2:{message:{imageMessage:{mimetype:'image/jpeg'}}}};
 await handle(x.sock,msg('.vv',{quoted:photo,chat:group}),c,x.db);let p=x.sent.at(-1);assert.equal(p.jid,group);assert.equal(p.payload.image.toString(),'image-data');assert.match(p.payload.caption,/permission/);
 await handle(x.sock,msg('.vv2',{quoted:photo,chat:group}),c,x.db);assert.equal(x.sent.at(-2).jid,'2348000000001@s.whatsapp.net');assert.equal(x.sent.at(-2).payload.image.toString(),'image-data');assert.match(x.sent.at(-1).payload.text,/Sent privately/);
 await x.db.del(`cooldown:${user}:viewonce`);await handle(x.sock,msg('.viewonce',{quoted:{imageMessage:{mimetype:'image/jpeg'}},chat:group}),c,x.db);assert.match(x.sent.at(-1).payload.text,/Reply to a view-once/);
 }finally{media.download=old;config.ownerNumber=owner;await x.close();}});
test('slap acknowledges with an emoji and one GIF; failure gives one useful reply',async()=>{
 const x=await setup(),old=reaction.gif;
 try{
  await x.db.set('settings:commandreact',true);
  reaction.gif=async()=>Buffer.from('gif');
  const m=msg('.slap',{target:person});m.key.id='slap';await handle(x.sock,m,loadCommands(),x.db);
  assert.equal(x.sent.length,2);assert.equal(x.sent[0].payload.react.text,'👋');assert.ok(x.sent[1].payload.video);assert.equal(x.sent[1].payload.caption,`@2348012345678 slapped @2348087654321`);assert.doesNotMatch(x.sent[1].payload.caption,/source|fetching/i);
  reaction.gif=async()=>{throw Error('offline')};const failed=msg('.punch',{target:person});failed.key.id='punch';await handle(x.sock,failed,loadCommands(),x.db);
  assert.equal(x.sent.length,4);assert.ok(x.sent[2].payload.react);assert.match(x.sent[3].payload.text,/Reaction unavailable/);assert.doesNotMatch(x.sent[3].payload.text,/source|fetching/i);
 }finally{reaction.gif=old;await x.close();}
});
