'use strict';const {spawn}=require('node:child_process'),path=require('node:path'),media=require('./media');
const MAX_AUDIO=10*1024*1024,MAX_SECONDS=30,MAX_PCM=2*1024*1024;let active=false;
async function transcribe(input){
 if(!Buffer.isBuffer(input)||!input.length||input.length>MAX_AUDIO)throw Error('Invalid audio');if(active)throw Error('Transcription busy');active=true;
 try{const raw=await media.convert(input,'f32',['-vn','-t',String(MAX_SECONDS),'-f','f32le','-ar','16000','-ac','1'],{maxDuration:MAX_SECONDS});if(!raw.length||raw.length>MAX_PCM)throw Error('Audio exceeds limit');
 return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'transcribe-worker.js')],{stdio:['pipe','pipe','ignore']});let output='',timed=false,oversized=false,settled=false;const timer=setTimeout(()=>{timed=true;child.kill('SIGKILL');},90000);const finish=(e,v)=>{if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve(v)};child.stdout.on('data',part=>{output+=part.toString();if(output.length>100000){oversized=true;child.kill('SIGKILL');}});child.stdin.on('error',()=>{});child.on('error',()=>finish(Error('Transcription failed')));child.on('close',code=>{if(timed||oversized||code!==0)return finish(Error('Transcription failed'));try{const j=JSON.parse(output);if(typeof j.text!=='string')throw Error();finish(null,j.text.slice(0,3000));}catch{finish(Error('Invalid transcription'));}});child.stdin.end(raw);});
 }finally{active=false;}
}
module.exports={transcribe,MAX_AUDIO,MAX_SECONDS,MAX_PCM};
