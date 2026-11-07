'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {handle}=require('../handler'),{loadCommands}=require('../lib/loader');
const ai=require('../lib/ai-text'),pdf=require('../lib/pdf-text'),media=require('../lib/media'),config=require('../config');
function db(){const m=new Map();return {get:async(k,d=null)=>m.has(k)?structuredClone(m.get(k)):d,set:async(k,v)=>{m.set(k,structuredClone(v));},del:async k=>{m.delete(k);}};}
test('both PDF forms react once then reply once, without a progress message',async()=>{
 const originals={download:media.download,extract:pdf.extract,run:ai.run,prefix:config.prefix};const commands=loadCommands(),sent=[];
 const sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(jid,payload)=>{sent.push({jid,payload});}};
 try{
  config.prefix='.';media.download=async()=>Buffer.from('%PDF-');pdf.extract=async()=>({text:'Details from the document',truncated:false,pages:1});
  ai.run=async(_ctx,prompt)=>{assert.match(prompt,/Details from the document/);assert.equal(sent.filter(x=>x.payload.text).length,0);return 'Here is the answer.';};
  for(const [i,text] of ['.askpdf What is this?','.ask pdf What is this?'].entries()){
   sent.length=0;const who=`234801111111${i}@s.whatsapp.net`,msg={key:{id:`pdf-${i}`,remoteJid:who},message:{documentMessage:{mimetype:'application/pdf',caption:text}}};
   await handle(sock,msg,commands,db());assert.equal(sent.length,2);assert.equal(sent[0].payload.react.text,'📄');assert.match(sent[1].payload.text,/Here is the answer/);assert.match(sent[1].payload.text,/sent to LLM7/);assert.doesNotMatch(sent[1].payload.text,/Reading the PDF/);
  }
 }finally{media.download=originals.download;pdf.extract=originals.extract;ai.run=originals.run;config.prefix=originals.prefix;}
});
test('missing PDF still produces one useful usage error',async()=>{
 const sent=[],sock={user:{id:'2348000000000@s.whatsapp.net'},sendMessage:async(jid,payload)=>sent.push({jid,payload})};
 const msg={key:{id:'missing',remoteJid:'2348011111111@s.whatsapp.net'},message:{conversation:'.ask pdf hello'}};
 await handle(sock,msg,loadCommands(),db());assert.equal(sent.length,2);assert.equal(sent[0].payload.react.text,'📄');assert.match(sent[1].payload.text,/Reply to or caption a PDF/);
});
test('privacy command discloses third-party sharing before use through command help',async()=>{
 const replies=[],c=loadCommands().get('privacy');await c.run({reply:async x=>replies.push(x)});
 assert.equal(replies.length,1);assert.match(replies[0],/LLM7/);assert.match(replies[0],/Google Translate/);assert.match(replies[0],/BlockRun/);assert.match(replies[0],/AI Horde/);
 assert.match(loadCommands().get('askpdf').description,/LLM7/);assert.match(loadCommands().get('tts').description,/Google Translate/);
});
