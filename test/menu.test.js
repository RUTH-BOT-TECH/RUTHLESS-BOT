'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const {loadCommands}=require('../lib/loader'),{handle}=require('../handler'),Database=require('../lib/database'),events=require('../lib/event-images'),config=require('../config');
const sender='2348012345678@s.whatsapp.net',chat='2348012345678@s.whatsapp.net';
const message=text=>({key:{remoteJid:chat,id:'test'},message:{conversation:text},pushName:'Dark eye developer'});
async function setup(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-menu-test-')),db=await new Database('',path.join(dir,'db.json')).connect(),sent=[];const sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(jid,payload,options)=>{sent.push({jid,payload,options});return {};},profilePictureUrl:async()=>{throw Error('hidden')}};return {dir,db,sent,sock,async close(){await db.close();await fs.rm(dir,{recursive:true,force:true});}};}
function unique(m){return [...new Set(m.values())].filter(x=>!x.ownerOnly);}
test('menu summary is compact, shows dynamic counts, tags sender and does not use pushName',async()=>{
 const x=await setup();try{const commands=loadCommands();await handle(x.sock,message('.menu'),commands,x.db);const p=x.sent.at(-1).payload,caption=p.caption||p.text;
  assert.ok(Buffer.isBuffer(p.image));assert.deepEqual(p.mentions,[sender]);assert.match(caption,/@2348012345678/);assert.doesNotMatch(caption,/Dark eye developer/);
  assert.match(caption,new RegExp('Commands: '+unique(commands).length));assert.match(caption,/\.menu ai \(33\)/);assert.match(caption,/\.menu downloaders \(48\)/);assert.doesNotMatch(caption,/\.menu owner\b/);
  assert.ok(caption.startsWith('┌─❖\n│ '));assert.match(caption,/└┬❖\n/);assert.ok(caption.endsWith('└───────❖'));assert.ok(caption.length<500);assert.ok(caption.split('\n').length<=15);
 }finally{await x.close();}
});
test('category page shows its own primary commands in aligned pairs and preserves help',async()=>{
 const x=await setup();try{const commands=loadCommands();await handle(x.sock,message('.menu ai'),commands,x.db);const p=x.sent.at(-1).payload,t=p.caption||p.text;
  assert.ok(Buffer.isBuffer(p.image));assert.match(t,/│ AI \(33\)/);assert.match(t,/│ ➤ \.ai\s+\.aiavatar/);assert.match(t,/\.paraphrase/);assert.doesNotMatch(t,/\.ytmp3/);assert.ok(t.split('\n').length<=40);assert.ok(t.startsWith('```┌─❖'));assert.ok(t.endsWith('└───────❖```'));
  await handle(x.sock,message('.help weather'),commands,x.db);assert.match(x.sent.at(-1).payload.text,/weather/);assert.match(x.sent.at(-1).payload.text,/Open-Meteo/);
 }finally{await x.close();}
});
test('unknown category reports actual categories; menu all sends an owner-filtered text file',async()=>{
 const x=await setup();try{const commands=loadCommands();await handle(x.sock,message('.menu fake'),commands,x.db);const t=x.sent.at(-1).payload.text;assert.match(t,/UNKNOWN CATEGORY/);assert.match(t,/\.menu ai \(33\)/);assert.match(t,/\.menu media \(47\)/);assert.ok(t.endsWith('└───────❖'));
  await handle(x.sock,message('.menu all'),commands,x.db);const p=x.sent.at(-1).payload;assert.equal(p.fileName,'menu.txt');assert.equal(p.mimetype,'text/plain');assert.ok(Buffer.isBuffer(p.document));const body=p.document.toString('utf8');assert.match(body,/AI \(33\)/);assert.match(body,/\.ai \(\.chatgpt/);assert.match(body,/DOWNLOADERS \(48\)/);assert.doesNotMatch(body,/\.backupnow\b|\.setprefix\b/);assert.ok(body.trimEnd().endsWith('└───────❖'));
 }finally{await x.close();}
});
test('large dynamic categories paginate with no more than 40 lines, no missing names, and invalid pages are rejected',async()=>{
 const x=await setup();try{const commands=loadCommands(),menu=commands.get('menu');for(let n=1;n<=145;n++){const name='c'+String(n).padStart(3,'0'),c={name,aliases:[],category:'huge',ownerOnly:false};commands.set(name,c);}
  let out=[];for(const page of [1,2,3]){await handle(x.sock,message(`.menu huge ${page}`),commands,x.db);const p=x.sent.at(-1).payload,t=p.caption||p.text;out.push(t);assert.ok(t.split('\n').length<=40);assert.match(t,/HUGE \(145\)/);assert.match(t,new RegExp(`${page}/3`));}
  for(let n=1;n<=145;n++){const name='.c'+String(n).padStart(3,'0');assert.equal(out.join('\n').split(name).length-1,1,name);}
  await handle(x.sock,message('.menu huge 4'),commands,x.db);assert.match(x.sent.at(-1).payload.text,/INVALID PAGE/);assert.match(x.sent.at(-1).payload.text,/1-3/);
 }finally{await x.close();}
});
test('menu image discovery reads assets/menus and retains compatibility with assets/menu',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-menus-'));try{await fs.mkdir(path.join(root,'menus'));await fs.mkdir(path.join(root,'menu'));const a=await sharp({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer(),b=await sharp({create:{width:10,height:10,channels:3,background:'blue'}}).png().toBuffer();await fs.writeFile(path.join(root,'menus','a.png'),a);await fs.writeFile(path.join(root,'menu','duplicate.png'),a);await fs.writeFile(path.join(root,'menu','b.png'),b);const found=await events.files('menu',root);assert.equal(found.length,2);assert.ok(found.some(v=>v.equals(a)));assert.ok(found.some(v=>v.equals(b)));}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('disabled group event image falls back to text with mention',async()=>{
 const x=await setup();try{const group='1234567890@g.us';await x.db.set(`group:${group}:eventimg`,false);const msg={key:{remoteJid:group,participant:sender},message:{conversation:'.menu'}};await handle(x.sock,msg,loadCommands(),x.db);const p=x.sent.at(-1).payload;assert.ok(p.text);assert.equal(p.image,undefined);assert.deepEqual(p.mentions,[sender]);}finally{await x.close();}
});
test('long names paginate below the conservative caption size without breaking command names',async()=>{
 const x=await setup();try{const commands=loadCommands();for(let n=1;n<=80;n++){const name='longcommand'+String(n).padStart(2,'0')+'-extended',c={name,aliases:[],category:'longnames',ownerOnly:false};commands.set(name,c);}
  const outputs=[];for(let page=1;page<=10;page++){await handle(x.sock,message(`.menu longnames ${page}`),commands,x.db);const p=x.sent.at(-1).payload,t=p.caption||p.text;if(t.includes('INVALID PAGE'))break;assert.ok(t.length<=900,`page ${page} has ${t.length} characters`);assert.ok(t.split('\n').length<=40);outputs.push(t);}
  assert.ok(outputs.length>1);for(let n=1;n<=80;n++){const name='.longcommand'+String(n).padStart(2,'0')+'-extended';assert.equal(outputs.join('\n').split(name).length-1,1,name);}
 }finally{await x.close();}
});
