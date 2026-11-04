const { Worker } = require('node:worker_threads');
const path = require('node:path');
let worker, start, nextId=0, pending=new Map(), busy=false;
const queue=[]; const MAX_QUEUE=12;
function ready() {
  if (start) return start;
  start=new Promise((resolve,reject) => {
    const w=new Worker(path.join(__dirname,'nsfw-worker.js')); worker=w;
    w.on('message', msg=>{
      if (msg.type==='ready') { if (!busy) w.unref(); resolve(); return; }
      if (msg.type==='error') { reject(Error(msg.error)); w.terminate(); return; }
      if (msg.type==='result') {
        const item=pending.get(msg.id); if (!item) return;
        pending.delete(msg.id); busy=false;
        if (msg.error) item.reject(Error(msg.error)); else item.resolve(msg.results);
        if (!queue.length) w.unref();
        pump();
      }
    });
    w.on('error', err=>{ reject(err); for (const p of pending.values()) p.reject(err); pending.clear(); busy=false; });
    w.on('exit', code=>{ if (worker!==w) return; worker=null; start=null; for (const p of pending.values()) p.reject(Error('NSFW worker stopped')); pending.clear(); busy=false; while(queue.length) queue.shift().reject(Error('NSFW worker stopped')); if (code) console.error('NSFW worker exited:',code); });
    // Worker should not keep CLI tests or graceful shutdown alive.
  });
  return start;
}
async function pump() {
  if (busy || !queue.length) return;
  busy=true; const item=queue.shift();
  try { await ready(); const bytes=await item.load(); const id=++nextId; pending.set(id,item); worker.ref(); worker.postMessage({ id, bytes }); }
  catch(e) { busy=false; item.reject(e); if (!queue.length) worker?.unref(); pump(); }
}
function classifyLazy(load) {
  if (queue.length + Number(busy) >= MAX_QUEUE) return Promise.reject(Error('NSFW queue is full'));
  return new Promise((resolve,reject)=>{ queue.push({load,resolve,reject}); pump(); });
}
function classify(bytes) { return classifyLazy(async () => bytes); }
module.exports={ready,classify,classifyLazy,MAX_QUEUE};
