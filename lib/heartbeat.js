'use strict';
const os=require('node:os');
const current=require('../package.json').version;
function isNewer(a,b){const parse=s=>/^(\d+)\.(\d+)\.(\d+)$/.exec(s||'')?.slice(1).map(Number);const x=parse(a),y=parse(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function startHeartbeat({client,db,sock,ownerNumber}){
 let busy=false,stopped=false;const tick=async()=>{if(busy||stopped)return;busy=true;try{const payload={botVersion:current,host:os.hostname().slice(0,100)};if(typeof db.lastError==='string'&&/^[A-Z0-9_:-]{1,80}$/.test(db.lastError))payload.lastError=db.lastError;const result=await client.heartbeat(payload);if(result.unused60Days)await sock.sendMessage(`${ownerNumber}@s.whatsapp.net`,{text:'⚠️ Your pairing data was inactive for 60 days. Records unused for 90 days may be removed.'});const latest=result.newerVersion;if(latest&&isNewer(latest.version,current)&&await db.get('heartbeat:lastNotifiedVersion','')!==latest.version){const changes=typeof latest.changelog==='string'?latest.changelog.slice(0,2500):'No changelog supplied.';await sock.sendMessage(`${ownerNumber}@s.whatsapp.net`,{text:`ℹ️ Ruthless ${latest.version} is available. No update was installed.\n\n${changes}`});await db.set('heartbeat:lastNotifiedVersion',latest.version);}}catch{console.warn('Heartbeat failed.');}finally{busy=false;}};
 tick();const timer=setInterval(tick,30*60*1000);timer.unref();return ()=>{stopped=true;clearInterval(timer);};
}
module.exports={startHeartbeat,isNewer};
