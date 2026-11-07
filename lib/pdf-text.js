'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const MAX_BYTES=5*1024*1024;let active=0;
async function extract(data){
 if(!Buffer.isBuffer(data)||data.length>MAX_BYTES||data.length<5||data.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');
 if(active>=1)throw Error('PDF reader busy');active++;
 try{return await new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'pdf-text-worker.js'),{workerData:{data},resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4}});
  let done=false;const timer=setTimeout(()=>finish(Error('PDF processing timed out')),20000);
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);worker.terminate().catch(()=>{});error?reject(error):resolve(value);}
  worker.once('message',result=>{if(!result?.ok)return finish(Error(result?.code==='TOO_MANY_PAGES'?'PDF exceeds 20 pages':'Cannot read PDF'));finish(null,result);});
  worker.once('error',()=>finish(Error('Cannot read PDF')));
  worker.once('exit',code=>{if(!done)finish(Error(`PDF reader stopped (${code})`));});
 });}finally{active--;}
}
module.exports={extract,MAX_BYTES};
