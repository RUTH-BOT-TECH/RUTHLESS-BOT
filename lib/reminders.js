'use strict';
const {withLock}=require('./game-lock'),{box}=require('../handler');
const PREFIX='reminder:';
function key(user){return PREFIX+user;}
function duration(value){const m=/^([1-9]\d{0,7})(s|m|h|d)$/i.exec(value||'');if(!m)return null;const n=Number(m[1])*({s:1000,m:60000,h:3600000,d:86400000})[m[2].toLowerCase()];return n>=10000&&n<=365*86400000?n:null;}
async function tick(sock,db,now=Date.now()){
 for(const [id] of await db.list(PREFIX)){
  await withLock(id,async()=>{
   const records=await db.get(id,[]);if(!Array.isArray(records))return;
   const due=records.filter(x=>Number.isFinite(x.dueAt)&&x.dueAt<=now).slice(0,25);
   for(const item of due){
    try{await sock.sendMessage(item.chat,{text:box(`⏰ Reminder for @${String(item.sender).split('@')[0].split(':')[0]}\n${item.text}`),mentions:[item.sender]});}
    catch{continue;}
    const latest=await db.get(id,[]);if(Array.isArray(latest))await db.set(id,latest.filter(x=>x.id!==item.id));
   }
  });
 }
}
function start(sock,db,{interval=15000}={}){let stopped=false,busy=false;const run=async()=>{if(stopped||busy)return;busy=true;try{await tick(sock,db);}catch{console.error('Reminder check failed; will retry.');}finally{busy=false;}};run();const timer=setInterval(run,interval);timer.unref();return ()=>{stopped=true;clearInterval(timer);};}
module.exports={key,duration,tick,start};
