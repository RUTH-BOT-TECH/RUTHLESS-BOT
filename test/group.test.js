const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('../lib/database');
const { loadCommands } = require('../lib/loader');
const { handle } = require('../handler');
const { processIncoming } = require('../lib/group-events');
const chat = 'group-1@g.us', admin = '234111111111@s.whatsapp.net', member = '234222222222@s.whatsapp.net', bot = '234333333333@s.whatsapp.net';
function socket() {
  const sent=[], actions=[];
  const meta={subject:'Test',participants:[{id:admin,admin:'admin'},{id:member,admin:null},{id:bot,admin:'admin'}]};
  return { sent,actions,user:{id:bot},groupMetadata:async()=>meta,sendMessage:async(jid,content)=>{sent.push(content)}, groupParticipantsUpdate:async(jid,ids,action)=>{actions.push([ids,action]); return ids.map(jid=>({jid,status:'200'}));},groupSettingUpdate:async(jid,v)=>{actions.push(v)} };
}
const msg = (sender,text) => ({ key:{remoteJid:chat,participant:sender,id:Math.random().toString()},message:{conversation:text},pushName:'Tester' });
test('group action permissions, safe targets and warnings', async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-g-'));
  const db=await new Database('',path.join(dir,'db.json')).connect(); const sock=socket(), cmds=loadCommands();
  try {
    await handle(sock,msg(member,'.kick 234111111111'),cmds,db);
    assert.match(sock.sent.at(-1).text,/Only group admins/); assert.equal(sock.actions.length,0);
    await handle(sock,msg(admin,'.kick 234333333333'),cmds,db); assert.match(sock.sent.at(-1).text,/protected/); assert.equal(sock.actions.length,0);
    await handle(sock,msg(admin,'.warn 234222222222 reason'),cmds,db);
    await handle(sock,msg(admin,'.warn 234222222222 reason'),cmds,db);
    assert.equal(await db.get(`warn:${chat}:${member}`),2);
    await handle(sock,msg(admin,'.warn 234222222222 reason'),cmds,db);
    assert.deepEqual(sock.actions.at(-1),[[member],'remove']); assert.equal(await db.get(`warn:${chat}:${member}`),0);
    await handle(sock,msg(admin,'.close'),cmds,db); assert.equal(sock.actions.at(-1),'announcement');
    await handle(sock,msg(admin,'.open'),cmds,db); assert.equal(sock.actions.at(-1),'not_announcement');
  } finally { await db.close(); await fs.rm(dir,{recursive:true,force:true}); }
});
test('antilink deletes non-admin links and exempts admins',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-g-'));
  const db=await new Database('',path.join(dir,'db.json')).connect(); const sock=socket(), cmds=loadCommands();
  try {
    await handle(sock,msg(admin,'.antilink delete'),cmds,db);
    assert.equal(await db.get(`group:${chat}:protection:antilink`),'delete');
    assert.equal(await processIncoming(sock,msg(member,'https://example.com'),db),true);
    assert.ok(sock.sent.at(-1).delete);
    assert.equal(await processIncoming(sock,msg(admin,'https://example.com'),db),false);
  } finally { await db.close(); await fs.rm(dir,{recursive:true,force:true}); }
});
test('unmapped LID is never removed automatically',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-g-')); const db=await new Database('',path.join(dir,'db.json')).connect();
  const sock=socket(); const original=sock.groupMetadata; sock.groupMetadata=async()=>{const m=await original();m.participants.push({id:'10001@lid',admin:null});return m};
  try { await db.set(`group:${chat}:protection:antilink`,'kick'); assert.equal(await processIncoming(sock,msg('10001@lid','https://example.com'),db),false); assert.equal(sock.actions.length,0); }
  finally {await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('antifake requires allowed prefixes, then removes only non-exempt disallowed joiners',async()=>{
  const { participantsUpdate }=require('../lib/group-events'); const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-g-')); const db=await new Database('',path.join(dir,'db.json')).connect();
  const sock=socket(), cmds=loadCommands();
  try {
    await handle(sock,msg(admin,'.antifake on'),cmds,db); assert.match(sock.sent.at(-1).text,/Set allowed phone prefixes/);
    await handle(sock,msg(admin,'.allowcountry add 1'),cmds,db); await handle(sock,msg(admin,'.antifake on'),cmds,db);
    await participantsUpdate(sock,{id:chat,action:'add',participants:[member]},db);
    assert.deepEqual(sock.actions.at(-1),[[member],'remove']);
    const count=sock.actions.length; await participantsUpdate(sock,{id:chat,action:'add',participants:[admin]},db); assert.equal(sock.actions.length,count);
  } finally {await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('antidelete replays cached non-admin text on a revoke event',async()=>{
  const { messageUpdates }=require('../lib/group-events'); const { WAMessageStubType }=require('@whiskeysockets/baileys');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-g-')); const db=await new Database('',path.join(dir,'db.json')).connect(); const sock=socket();
  try { await db.set(`group:${chat}:protection:antidelete`,'on'); const m=msg(member,'hello world'); await processIncoming(sock,m,db);
    await messageUpdates(sock,[{key:m.key,update:{messageStubType:WAMessageStubType.REVOKE}}],db);
    assert.match(sock.sent.at(-1).text,/Deleted by/); assert.match(sock.sent.at(-1).text,/hello world/);
  } finally {await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('NSFW worker loads bundled model and classifies an image', {timeout:30000}, async()=>{
  const sharp=require('sharp'), queue=require('../lib/nsfw-queue');
  const png=await sharp({create:{width:24,height:24,channels:3,background:'#ffffff'}}).png().toBuffer();
  const results=await queue.classify(png);
  assert.ok(results.some(x=>x.className==='Porn')); assert.ok(results.every(x=>x.probability>=0 && x.probability<=1));
});
test('LID mapping resolves owner and protects owner/admin/bot targets',async()=>{
  const config=require('../config'), old=config.ownerNumber; config.ownerNumber='234222222222';
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-lid-')); const db=await new Database('',path.join(dir,'db.json')).connect();
  const sock=socket(), cmds=loadCommands();
  const original=sock.groupMetadata;
  sock.groupMetadata=async()=>{ const m=await original(); m.participants=m.participants.map(p=>p.id===member ? {id:'99999@lid',admin:null} : p); return m; };
  sock.signalRepository={lidMapping:{getPNForLID:async x=>x==='99999@lid'?'234222222222:0@s.whatsapp.net':null,getLIDForPN:async x=>x.startsWith('234222222222')?'99999@lid':null}};
  try {
    const {isOwner}=require('../lib/owner'); assert.equal(await isOwner(sock,'99999@lid'),true);
    await handle(sock,msg(admin,'.kick 234222222222'),cmds,db);
    assert.match(sock.sent.at(-1).text,/protected/); assert.equal(sock.actions.length,0);
    assert.equal(await processIncoming(sock,msg('99999@lid','https://example.com'),db),false);
  } finally {config.ownerNumber=old;await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
