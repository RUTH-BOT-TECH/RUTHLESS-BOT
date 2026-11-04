'use strict';const sharp=require('sharp');const {ProxyAgent,fetch}=require('undici');const {createSafeProxy}=require('./safe-proxy');const {boundedBody}=require('./public-files');
const API='https://aihorde.net/api/v2',MAX_BYTES=10*1024*1024;let active=0;
const headers={'content-type':'application/json','apikey':'0000000000','client-agent':'Ruthless-MD:1.0:https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function imageURL(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.endsWith('.r2.cloudflarestorage.com');}catch{return false;}}
async function api(path,options={}){const r=await fetch(API+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok){await r.body?.cancel();throw Error('AI Horde unavailable');}return JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'));}
async function prepareSource(input){
 if(!Buffer.isBuffer(input)||!input.length||input.length>50*1024*1024)throw Error('Invalid source image');
 const image=sharp(input,{limitInputPixels:40000000});const meta=await image.metadata();
 if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height)throw Error('Unsupported source image');
 return image.rotate().resize(512,512,{fit:'contain',background:'#ffffff'}).jpeg({quality:80}).toBuffer();
}
async function generate(prompt,{source}={}){
 if(!prompt||prompt.length>500)throw Error('Invalid prompt');if(active>=2)throw Error('Image generator busy');active++;let id,done=false,proxy,dispatcher;
 try{
  const request={prompt,params:{width:512,height:512,steps:15,n:1},models:['stable_diffusion'],nsfw:false,censor_nsfw:true,r2:true};
  if(source){const prepared=await prepareSource(source);request.source_image=prepared.toString('base64');request.source_processing='img2img';request.params.denoising_strength=0.65;}
  const job=await api('/generate/async',{method:'POST',body:JSON.stringify(request)});
  if(!/^[0-9a-f-]{36}$/i.test(job.id||''))throw Error('Invalid job');id=job.id;
  const until=Date.now()+120000;while(Date.now()<until){await wait(5000);const check=await api(`/generate/check/${id}`);if(check.faulted)throw Error('Image job failed');if(check.done){done=true;break;}}
  if(!done)throw Error('Image generation timed out');const status=await api(`/generate/status/${id}`);const result=status.generations?.[0];if(!result||!imageURL(result.img))throw Error('No image');
  proxy=await createSafeProxy();dispatcher=new ProxyAgent(proxy.url);const r=await fetch(result.img,{dispatcher,redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok){await r.body?.cancel();throw Error('Image unavailable');}const bytes=await boundedBody(r,MAX_BYTES);const img=sharp(bytes,{limitInputPixels:40000000}),meta=await img.metadata();if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height||meta.width>4096||meta.height>4096)throw Error('Invalid image');const data=await img.png().toBuffer();if(data.length>50*1024*1024)throw Error('Image too large');return {data,model:String(result.model||'stable_diffusion').replace(/[\r\n]/g,' ').slice(0,80)};
 }finally{if(id&&!done)try{await api(`/generate/status/${id}`,{method:'DELETE'});}catch{}if(dispatcher)await dispatcher.close().catch(()=>{});proxy?.close();active--;}
}
module.exports={generate,prepareSource,imageURL,MAX_BYTES};
