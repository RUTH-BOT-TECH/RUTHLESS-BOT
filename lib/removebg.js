const {Worker}=require('node:worker_threads');
const path=require('node:path');
let active=false;
function removeBackground(buffer) {
 if(active)return Promise.reject(Error('Background removal is busy. Try again shortly.'));
 active=true;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'removebg-worker.js'),{workerData:buffer});let finished=false;
  const timer=setTimeout(()=>finish(Error('Background removal timed out.')),90000);
  function finish(error,bytes){if(finished)return;finished=true;clearTimeout(timer);active=false;worker.terminate();if(error)reject(error);else resolve(Buffer.from(bytes));}
  worker.on('message',m=>m.error?finish(Error(m.error)):finish(null,m.bytes));worker.on('error',e=>finish(e));worker.on('exit',code=>{if(!finished)finish(Error(`Background worker exited: ${code}`));});
 });
}
module.exports={removeBackground};
