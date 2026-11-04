'use strict';
const path=require('node:path');
(async()=>{
 const parts=[];let size=0;for await(const part of process.stdin){size+=part.length;if(size>2*1024*1024)throw Error('Audio too long');parts.push(part);}const pcm=Buffer.concat(parts);if(!pcm.length||pcm.length%4)throw Error('Invalid audio');
 const audio=new Float32Array(pcm.length/4);for(let i=0;i<audio.length;i++){const x=pcm.readFloatLE(i*4);audio[i]=Number.isFinite(x)?x:0;}
 const {env,pipeline}=await import('@huggingface/transformers');env.allowRemoteModels=false;env.localModelPath=path.join(__dirname,'../assets/models');
 const transcriber=await pipeline('automatic-speech-recognition','whisper-tiny.en',{dtype:'q8',device:'cpu',local_files_only:true});
 try{const output=await transcriber(audio,{max_new_tokens:160});process.stdout.write(JSON.stringify({text:String(output.text||'').trim().slice(0,3000)}));}finally{await transcriber.dispose();}
})().catch(()=>{process.exitCode=1;});
