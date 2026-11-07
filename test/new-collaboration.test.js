'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadCommands}=require('../lib/loader'),ai=require('../lib/ai-text'),media=require('../lib/media'),pdf=require('../lib/pdf-text');
function memory(){const map=new Map();return {async get(k,f=null){return map.has(k)?structuredClone(map.get(k)):f;},async set(k,v){map.set(k,structuredClone(v));},async del(k){map.delete(k);}};}
function ctx(db,chat='123456789@g.us',sender='111111111@s.whatsapp.net'){return {db,chat,sender,group:true,owner:false,args:[],replies:[],msg:{key:{remoteJid:chat,participant:sender},message:{conversation:'.test'}},sock:{},async reply(text){this.replies.push(text);}};}
async function run(c,command,args){c.args=args.split(' ').filter(Boolean);await command.run(c);return c.replies.at(-1);}
function samplePdf(pages=1){const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${pages} >>`];for(let i=0;i<pages;i++){objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${4+i*2} 0 R >>`);const stream='BT /F1 12 Tf 10 250 Td (Hello PDF world) Tj ET';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out);}
test('all five commands register without aliases colliding',()=>{const cmds=loadCommands();for(const name of ['askpdf','studyquiz','taskboard','eventrsvp','groupdigest'])assert.ok(cmds.get(name),name);});
test('PDF reader extracts text locally and enforces file and page limits',async()=>{const result=await pdf.extract(samplePdf());assert.match(result.text,/Hello PDF world/);assert.equal(result.pages,1);await assert.rejects(pdf.extract(Buffer.from('not a PDF')),/Invalid PDF/);await assert.rejects(pdf.extract(samplePdf(21)),/20 pages/);});
test('askpdf sends only extracted text and question, replies once, and refuses view-once',async()=>{
 const command=loadCommands().get('askpdf'),oldSource=media.sourceMessage,oldInfo=media.mediaInfo,oldDownload=media.download,oldExtract=pdf.extract,oldRun=ai.run;const c=ctx(memory());c.args=['What','is','it?'];let call;
 try{media.sourceMessage=()=>({message:{documentMessage:{}}});media.mediaInfo=()=>({type:'document',data:{mimetype:'application/pdf'}});media.download=async()=>Buffer.from('%PDF-');pdf.extract=async()=>({text:'Document facts',pages:1,truncated:false});ai.run=async(_ctx,text,system,opts)=>{assert.equal(c.replies.length,0);call={text,system,opts};return 'An answer';};await command.run(c);assert.match(call.text,/Document facts/);assert.equal(call.opts.memory,false);assert.equal(c.replies.length,1);assert.match(c.replies[0],/An answer/);assert.match(c.replies[0],/sent to LLM7/);c.msg.message={viewOnceMessage:{message:{documentMessage:{}}}};c.replies=[];call=null;await command.run(c);assert.equal(call,null);assert.match(c.replies[0],/Reply to or caption a PDF/);}finally{media.sourceMessage=oldSource;media.mediaInfo=oldInfo;media.download=oldDownload;pdf.extract=oldExtract;ai.run=oldRun;}
});
test('study quizzes are scoped to participant and chat, score answers, and do not save notes',async()=>{
 const db=memory(),command=loadCommands().get('studyquiz'),old=ai.run,a=ctx(db),b=ctx(db,a.chat,'222222222@s.whatsapp.net');
 try{ai.run=async()=>JSON.stringify([{question:'Question 1?',options:['one','two','three'],answer:'A'},{question:'Question 2?',options:['one','two','three'],answer:'B'},{question:'Question 3?',options:['one','two','three'],answer:'C'}]);let result=await run(a,command,'My notes on biology');assert.match(result,/Question 1/);assert.equal(a.replies.length,1);assert.match(a.replies[0],/notes were sent to LLM7/);assert.match(await run(b,command,'answer A'),/No active quiz/);assert.match(await run(a,command,'answer A'),/Question 2/);assert.match(await run(a,command,'answer A'),/Correct answer: B/);assert.match(await run(a,command,'answer C'),/2\/3/);assert.match(await run(a,command,'answer A'),/No active quiz/);}finally{ai.run=old;}
});
test('taskboard keeps groups separate, serializes writes and protects tasks',async()=>{
 const db=memory(),command=loadCommands().get('taskboard'),a=ctx(db),b=ctx(db,a.chat,'222222222@s.whatsapp.net'),other=ctx(db,'different@g.us');
 const [first,second]=await Promise.all([run(a,command,'add first item'),run(b,command,'add second item')]);const firstId=/\[([a-f0-9]{8})\]/.exec(first)[1];assert.match(await run(a,command,'list'),/first item/);assert.match(await run(a,command,'list'),/second item/);assert.match(await run(other,command,'list'),/No tasks/);assert.match(await run(b,command,`delete ${firstId}`),/Only the task creator/);assert.match(await run(a,command,`done ${firstId}`),/marked done/);
});
test('event RSVP validates UTC and allows only creator or owner to cancel',async()=>{
 const db=memory(),command=loadCommands().get('eventrsvp'),a=ctx(db),b=ctx(db,a.chat,'222222222@s.whatsapp.net'),date=new Date(Date.now()+86400000).toISOString().slice(0,16)+'Z';
 assert.match(await run(a,command,'create bad | Birthday'),/Time is UTC/);assert.match(await run(a,command,`create ${date} | Birthday`),/Birthday/);assert.match(await run(b,command,'yes'),/RSVP saved/);assert.match(await run(a,command,'list'),/Yes: 1/);assert.match(await run(b,command,'cancel'),/Only the event creator/);assert.match(await run(a,command,'cancel'),/deleted/);
});
test('group digest uses only submitted text, informs users about provider, and enforces ownership',async()=>{
 const db=memory(),command=loadCommands().get('groupdigest'),a=ctx(db),b=ctx(db,a.chat,'222222222@s.whatsapp.net'),old=ai.run;let captured;
 try{const added=await run(a,command,'add My update');const entry=/\[([a-f0-9]{8})\]/.exec(added)[1];assert.match(added,/sent to LLM7/);assert.match(await run(b,command,`remove ${entry}`),/Only the contributor/);b.replies=[];ai.run=async(_ctx,text,_system,opts)=>{captured=text;assert.equal(opts.memory,false);assert.equal(b.replies.length,0);return 'Summary';};const summary=await run(b,command,'summarize');assert.match(summary,/Summary/);assert.match(summary,/sent to LLM7/);assert.equal(b.replies.length,1);assert.match(captured,/My update/);assert.match(await run(a,command,`remove ${entry}`),/removed/);assert.match(await run(b,command,'summarize'),/No submitted/);}finally{ai.run=old;}
});

test('real handler restricts group boards in private chats and runs them in a group',async()=>{
 const {handle}=require('../handler'),config=require('../config'),db=memory(),commands=loadCommands(),sent=[];
 const oldPrefix=config.prefix;config.prefix='.';
 const sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(jid,payload)=>{sent.push({jid,payload});return {};}};
 try{
  await handle(sock,{key:{remoteJid:'2348011111111@s.whatsapp.net'},message:{conversation:'.taskboard add private'}},commands,db);
  assert.match(sent.at(-1).payload.text,/only be used in a group/);
  await handle(sock,{key:{remoteJid:'1111111111@g.us',participant:'2348011111111@s.whatsapp.net'},message:{conversation:'.taskboard add agenda'}},commands,db);
  assert.match(sent.at(-1).payload.text,/added/);
  await handle(sock,{key:{remoteJid:'1111111111@g.us',participant:'2348011111111@s.whatsapp.net'},message:{conversation:'.taskboard'}},commands,db);
  // The command has a one-second cooldown, so exercise the other member instead.
  await new Promise(r=>setTimeout(r,1100));
  await handle(sock,{key:{remoteJid:'1111111111@g.us',participant:'2348011111111@s.whatsapp.net'},message:{conversation:'.taskboard'}},commands,db);
  assert.match(sent.at(-1).payload.text,/agenda/);
 }finally{config.prefix=oldPrefix;}
});
