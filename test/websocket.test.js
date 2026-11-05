'use strict';
// Local transport simulation only: this is NOT a WhatsApp protocol or account test.
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {WebSocketServer,WebSocket}=require('ws');const sharp=require('sharp');
const Database=require('../lib/database'),{handle}=require('../handler'),{loadCommands}=require('../lib/loader'),media=require('../lib/media');

test('local WebSocket transport exercises command replies, images, OCR, and failure handling',{timeout:120000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruth-ws-test-'));const db=await new Database('',path.join(dir,'db.json')).connect();
 const originalDownload=media.download,originalFetch=global.fetch;const payloads=new Map();let wss,client;
 try{
  media.download=async(_sock,msg)=>{const bytes=payloads.get(msg.key.id);if(!bytes)throw Error('No simulated attachment');return bytes;};
  wss=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:4*1024*1024,perMessageDeflate:false});await once(wss,'listening');
  const commands=loadCommands();wss.on('connection',ws=>ws.on('message',async raw=>{
   let input;try{input=JSON.parse(raw);const id=String(input.id),chat=input.group?'987654321@g.us':`2348${String(id).padStart(8,'0')}@s.whatsapp.net`;
    const msg={key:{id,remoteJid:chat,...(input.group?{participant:input.sender}:{})},message:input.image?{imageMessage:{caption:input.text}}:input.audio?{extendedTextMessage:{text:input.text,contextInfo:{stanzaId:id,quotedMessage:{audioMessage:{}}}}}:input.group?{extendedTextMessage:{text:input.text,contextInfo:{mentionedJid:input.mention?[input.mention]:[],...(input.quotedText?{quotedMessage:{conversation:input.quotedText},stanzaId:id,participant:input.sender}:{})}}}:{conversation:input.text},pushName:'Socket Tester'};
    if(input.image)payloads.set(id,Buffer.from(input.image,'base64'));if(input.audio)payloads.set(id,Buffer.from(input.audio,'base64'));
    const sock={user:{id:'234111111111@s.whatsapp.net'},groupMetadata:async()=>({participants:[{id:'234800000001@s.whatsapp.net',admin:'admin'},{id:'234800000002@s.whatsapp.net'}]}),profilePictureUrl:async()=>{throw Error('hidden')},sendMessage:async(_jid,p)=>{const out={...p};if(Buffer.isBuffer(p.image))out.image={base64:p.image.toString('base64')};if(Buffer.isBuffer(p.audio))out.audio={base64:p.audio.toString('base64')};if(Buffer.isBuffer(p.video))out.video={base64:p.video.toString('base64')};ws.send(JSON.stringify({id,type:'reply',payload:out}));}};
    await handle(sock,msg,commands,db);ws.send(JSON.stringify({id,type:'done'}));payloads.delete(id);
   }catch{if(input?.id)ws.send(JSON.stringify({id:String(input.id),type:'failed'}));}
  }));
  client=new WebSocket(`ws://127.0.0.1:${wss.address().port}`);await once(client,'open');let next=1;
  const request=(text,image,audio,extra={})=>new Promise((resolve,reject)=>{const id=String(next++),replies=[],reactions=[];replies.reactions=reactions;const timer=setTimeout(()=>finish(Error('WebSocket request timed out')),65000);function finish(err){clearTimeout(timer);client.off('message',onMessage);err?reject(err):resolve(replies);}function onMessage(buf){const m=JSON.parse(buf);if(m.id!==id)return;if(m.type==='reply'){if(m.payload.react)reactions.push(m.payload.react);else replies.push(m.payload);}else if(m.type==='done')finish();else if(m.type==='failed')finish(Error('Simulated handler failed'));}client.on('message',onMessage);client.send(JSON.stringify({id,text,...extra,...(image?{image:image.toString('base64')}:{}),...(audio?{audio:audio.toString('base64')}:{})}));});
  let out=await request('.ping');assert.equal(out.reactions.length,1);assert.equal(out.reactions[0].text,'🤖');assert.equal(out.reactions[0].key.id,'1');assert.equal(out.length,1);assert.match(out[0].text,/Pong/);
  out=await request('.menu');assert.ok(out[0].image.base64);assert.equal((await sharp(Buffer.from(out[0].image.base64,'base64')).metadata()).format,'jpeg');assert.match(out[0].caption,/Commands:/);
  out=await request('.profile');assert.ok(out[0].image.base64);assert.match(out[0].caption,/default profile picture/);
  out=await request('.groupinfo');assert.match(out[0].text,/only be used in a group/);
  const image=await sharp(Buffer.from('<svg width="900" height="170" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="25" y="110" font-family="Arial,sans-serif" font-size="72" fill="black">Hello Ruthless 2026</text></svg>')).png().toBuffer();
  out=await request('.ocr',image);assert.match(out.at(-1).text,/Hello Ruthless 2026/);
  out=await request('.ocr');assert.match(out.at(-1).text,/Reply to or caption an image/);
  const audio=await fs.readFile(path.join(__dirname,'fixtures/english-speech.ogg'));out=await request('.stt',null,audio);assert.match(out.at(-1).text,/Hello Ruthless/i);
  const a='234800000001@s.whatsapp.net',b='234800000002@s.whatsapp.net',group=(sender,mention)=>({group:true,sender,mention});
  {const cfg=require('../config'),old=cfg.ownerNumber;try{cfg.ownerNumber='234800000001';out=await request('.private',null,null,group(a));assert.match(out.at(-1).text,/Private mode/);out=await request('.slots',null,null,group(b));assert.equal(out.length,0);assert.equal(out.reactions.length,0);out=await request('.ownermenu',null,null,group(a));assert.match(out.at(-1).text,/\.update/);out=await request('.public',null,null,group(a));assert.match(out.at(-1).text,/Public mode/);}finally{cfg.ownerNumber=old;await db.del('settings:mode');}}

  out=await request('.eventimg off',null,null,group(a));assert.match(out.at(-1).text,/Event images off/);out=await request('.menu',null,null,group(a));assert.ok(out.at(-1).text);assert.ok(!out.at(-1).image);out=await request('.eventimg on',null,null,group(a));out=await request('.menu',null,null,group(a));assert.ok(out.at(-1).image.base64);
  out=await request('.addnote socket test',null,null,group(a));assert.match(out.at(-1).text,/Note saved/);
  await db.del(`cooldown:${a}:note`);out=await request('.notes',null,null,group(a));assert.match(out.at(-1).text,/socket test/);
  out=await request('.bookmark https://example.com test',null,null,group(a));assert.match(out.at(-1).text,/Bookmark saved/);
  out=await request('.bookmarks',null,null,group(a));assert.match(out.at(-1).text,/example.com/);
  out=await request('.savemsg',null,null,{...group(a),quotedText:'saved over websocket'});assert.match(out.at(-1).text,/Only text was saved/);
  out=await request('.savedmsgs',null,null,group(a));assert.match(out.at(-1).text,/saved over websocket/);
  out=await request('.timer 1m websocket timer',null,null,group(a));assert.match(out.at(-1).text,/Scheduled/);
  out=await request('.hex2text 48656c6c6f',null,null,group(a));assert.match(out.at(-1).text,/Hello/);
  out=await request('.sha256 hello',null,null,group(a));assert.match(out.at(-1).text,/2cf24dba5fb0a30e/);
  out=await request('.rot13 hello',null,null,group(a));assert.match(out.at(-1).text,/uryyb/);
  out=await request('.num2roman 1994',null,null,group(a));assert.match(out.at(-1).text,/MCMXCIV/);
  out=await request('.daily',null,null,group(a));assert.match(out.at(-1).text,/500 virtual coins/);
  out=await request('.buy seed 2',null,null,group(a));assert.match(out.at(-1).text,/Bought 2 seed/);
  out=await request('.plant 2',null,null,group(a));assert.match(out.at(-1).text,/Planted 2/);
  out=await request('.farm',null,null,group(a));assert.match(out.at(-1).text,/2 corn crop/);
  out=await request('.transfer @234800000002 200',null,null,group(a,b));assert.match(out.at(-1).text,/Transferred 200/);
  out=await request('.balance',null,null,group(b));assert.match(out.at(-1).text,/Wallet: 200/);
  out=await request('.calc (2+3)*4');assert.match(out.at(-1).text,/= 20/);
  out=await request('.qr socket qr');const generatedQR=Buffer.from(out.at(-1).image.base64,'base64');out=await request('.qrread',generatedQR);assert.match(out.at(-1).text,/socket qr/);
  out=await request('.bass',null,await fs.readFile(path.join(__dirname,'fixtures/english-speech.ogg')));assert.equal(out.at(-1).mimetype,'audio/mpeg');
  out=await request('.trim 0 1',null,await fs.readFile(path.join(__dirname,'fixtures/english-speech.ogg')));assert.equal(out.at(-1).mimetype,'audio/mpeg');
  {const previous=global.fetch;try{global.fetch=async()=>Response.json([{word:'joyful'}]);out=await request('.synonym happy');assert.match(out.at(-1).text,/joyful/);}finally{global.fetch=previous;}}
  out=await request('.unit 1 km m',null,null,group(a));assert.match(out.at(-1).text,/1000 m/);
  out=await request('.km2miles 1',null,null,group(a));assert.match(out.at(-1).text,/0\.621371/);
  {const old=global.fetch;try{global.fetch=async()=>new Response('<rss><channel><item><title>New science discovery</title><link>https://news.google.com/articles/test</link></item></channel></rss>');out=await request('.science-news NG',null,null,group(a));assert.match(out.at(-1).text,/New science discovery/);}finally{global.fetch=old;}}
  out=await request('.area 1 acre m2',null,null,group(a));assert.match(out.at(-1).text,/4046\.8564224/);
  out=await request('.remind 10s websocket test',null,null,group(a));assert.match(out.at(-1).text,/Reminder saved/);
  out=await request('.wordle',null,null,group(a));assert.match(out.at(-1).text,/five-letter/);
  out=await request('.guesscapital',null,null,group(a));assert.match(out.at(-1).text,/Three attempts/);
  const quiz=await db.get(`game:personal:guesscapital:987654321@g.us:${a}`);out=await request('.guesscapital '+quiz.answer,null,null,group(a));assert.match(out.at(-1).text,/Correct/);
  const personalWordle=await db.get(`game:personal:wordle:987654321@g.us:${a}`);out=await request('.wordle '+personalWordle.answer,null,null,group(a));assert.match(out.at(-1).text,/Solved/);
  {const profiles=require('../lib/public-profiles'),previous=profiles.minecraft;try{profiles.minecraft=async()=>({name:'Notch',id:'069a79f444e94726a5befca90e38aaf5'});out=await request('.mcuser Notch',null,null,group(a));assert.match(out.at(-1).text,/Mojang/);}finally{profiles.minecraft=previous;}}
  {const env=require('../lib/environment-info'),previous=env.json;try{env.json=async()=>({type:'FeatureCollection',features:[]});out=await request('.earthquake',null,null,group(a));assert.match(out.at(-1).text,/No events/);}finally{env.json=previous;}}
  out=await request('.roulette red',null,null,group(a));assert.match(out.at(-1).text,/Free play/);
  out=await request('.neon RUTHLESS',null,null,group(a));assert.ok(out.at(-1).image.base64);assert.equal((await sharp(Buffer.from(out.at(-1).image.base64,'base64')).metadata()).format,'png');
  out=await request('.ttt @234800000002',null,null,group(a,b));assert.match(out.at(-1).text,/plays first/);
  for(const [sender,move] of [[a,1],[b,4],[a,2],[b,5],[a,3]])out=await request('.ttt move '+move,null,null,group(sender));assert.match(out.at(-1).text,/wins/);
  out=await request('.connect4 @234800000002',null,null,group(a,b));assert.match(out.at(-1).text,/starts/);for(const [sender,move] of [[a,1],[b,2],[a,1],[b,2],[a,1],[b,2],[a,1]])out=await request('.connect4 move '+move,null,null,group(sender));assert.match(out.at(-1).text,/wins Connect 4/);
  out=await request('.chess @234800000002',null,null,group(a,b));assert.match(out.at(-1).text,/White starts/);for(const [sender,move] of [[a,'f2f3'],[b,'e7e5'],[a,'g2g4'],[b,'Qh4#']])out=await request('.chess move '+move,null,null,group(sender));assert.match(out.at(-1).text,/Checkmate/);
  out=await request('.guessnumber',null,null,group(a));assert.match(out.at(-1).text,/1 to 100/);const guessGame=await db.get('game:guessnumber:987654321@g.us');out=await request('.guessnumber '+guessGame.answer,null,null,group(a));assert.match(out.at(-1).text,/Correct/);
  out=await request('.dice 20');assert.match(out.at(-1).text,/d20: (?:[1-9]|1[0-9]|20)/);
  if(process.env.RUN_LIVE_TICKLE_TESTS==='1'){out=await request('.tickle @234800000002',null,null,group(a,b));assert.equal(out.at(-1).gifPlayback,true);assert.equal(Buffer.from(out.at(-1).video.base64,'base64').subarray(4,8).toString(),'ftyp');console.log('LIVE WEBSOCKET: OtakuGIFs tickle converted to MP4');}
  if(process.env.RUN_LIVE_TRIVIA_TESTS==='1'){out=await request('.trivia');assert.match(out.at(-1).text,/Source: Open Trivia Database/);assert.match(out.at(-1).text,/A\./);console.log('LIVE WEBSOCKET: Open Trivia Database returned a question');}
  if(process.env.RUN_LIVE_VISION_TESTS==='1'){
   const pic=await fs.readFile(path.join(__dirname,'../assets/default-pfp.jpg'));out=await request('.vision Which single letter is shown? Give a brief answer.',pic);assert.match(out.at(-1).text,/Model: /);assert.match(out.at(-1).text,/\bR\b/);console.log('LIVE WEBSOCKET: BlockRun vision identified the letter R');
  }
  if(process.env.RUN_LIVE_TTS_TESTS==='1'){
   out=await request('.tts Hello Ruthless, this is a voice test.');assert.equal(out.at(-1).ptt,true);assert.equal(Buffer.from(out.at(-1).audio.base64,'base64').subarray(0,4).toString(),'OggS');console.log('LIVE WEBSOCKET: Google Translate returned an Opus voice note');
  }
  if(process.env.RUN_LIVE_AI_TESTS==='1'){
   out=await request('.tr es Good morning, my friend.');assert.match(out.at(-1).text,/Mistral Nemo via LLM7/);assert.match(out.at(-1).text,/buenos d[ií]as/i);
   console.log('LIVE WEBSOCKET: LLM7 translation returned',out.at(-1).text.replace(/\n/g,' '));
  }else{
   global.fetch=async()=>new Response('',{status:429});out=await request('.ai hello');assert.match(out.at(-1).text,/unavailable or rate-limited/);
  }
 }finally{global.fetch=originalFetch;media.download=originalDownload;if(client){client.terminate();}if(wss){for(const c of wss.clients)c.terminate();await new Promise(r=>wss.close(r));}await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
