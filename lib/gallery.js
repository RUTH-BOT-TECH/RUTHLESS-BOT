'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const {ProxyAgent,fetch}=require('undici');
const {createSafeProxy}=require('./safe-proxy');
const {boundedBody}=require('./public-files');
const runtime=require('./python-runtime');
const LIMIT=50*1024*1024, MAX_SLIDES=20;
let active=0;
function validTikTokPhoto(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.tiktok.com','tiktok.com','m.tiktok.com'].includes(u.hostname)&&/^\/@[A-Za-z0-9._-]{1,64}\/photo\/\d{10,24}\/?$/.test(u.pathname);}catch{return false;}}
async function runGallery(url,proxy,dir){
 let found=await runtime.modulePython('gallery_dl');if(!found){await require('./downloader-health').ensureStartup();found=await runtime.modulePython('gallery_dl');if(!found){await runtime.setup();found=await runtime.modulePython('gallery_dl');}}if(!found)throw Error('gallery-dl is not installed');
 return new Promise((resolve,reject)=>{
 const args=['-m','gallery_dl','--config-ignore','--no-input','--cache-file',path.join(dir,'cache.sqlite3'),'--http-timeout','12','--retries','0','--sleep-429','0','--proxy',proxy,'--range',`1-${MAX_SLIDES+1}`,'--filter',"extension in ('jpg','jpeg','png','webp')",'-o','downloader.ytdl.enabled=false','-g','--',url];
 const proc=spawn(found.bin,args,{cwd:dir,stdio:['ignore','pipe','pipe'],env:{...runtime.safeEnv({home:dir}),XDG_CONFIG_HOME:dir}});let out='',err='',expired=false,overflow=false;
 const timer=setTimeout(()=>{expired=true;proc.kill('SIGKILL');},60000);
 proc.stdout.on('data',b=>{out+=b.toString();if(out.length>200000){overflow=true;proc.kill('SIGKILL');}});
 proc.stderr.on('data',b=>{if(err.length<5000)err+=b.toString().slice(0,5000-err.length);});
 proc.once('error',e=>{clearTimeout(timer);reject(e)});proc.once('close',code=>{clearTimeout(timer);if(expired||overflow)return reject(Error('Gallery unavailable'));if(code!==0)return reject(Error(err.includes('No module named gallery_dl')?'gallery-dl is not installed':'Gallery unavailable'));const urls=out.split(/\r?\n/).filter(Boolean);if(urls.length>MAX_SLIDES)throwReject(reject,'Too many slides');else if(!urls.length)throwReject(reject,'No slides');else resolve(urls);});
});}
function throwReject(reject,msg){reject(Error(msg));}
async function getImage(raw,dispatcher,signal,remaining){
 let url=raw;
 for(let i=0;i<4;i++){
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Unsafe image URL');
  const res=await fetch(url,{dispatcher,redirect:'manual',signal,headers:{'User-Agent':'Mozilla/5.0'}});
  if(res.status>=300&&res.status<400){const loc=res.headers.get('location');await res.body?.cancel();if(!loc)throw Error('Bad redirect');url=new URL(loc,url).href;continue;}
  if(!res.ok){await res.body?.cancel();throw Error('Image unavailable');}
  const data=await boundedBody(res,remaining);const meta=await sharp(data,{limitInputPixels:40000000}).metadata();if(!['jpeg','png','webp'].includes(meta.format))throw Error('Not an image');
  const image=await sharp(data,{limitInputPixels:40000000}).rotate().jpeg({quality:85}).toBuffer();if(image.length>remaining)throw Error('File exceeds size limit');return image;
 }throw Error('Too many redirects');
}
async function downloadSlides(url){
 if(!validTikTokPhoto(url))throw Error('Invalid photo-post link');if(active>=2)throw Error('Gallery is busy');active++;
 let dir,proxy,dispatcher;try{
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-gallery-'));proxy=await createSafeProxy();dispatcher=new ProxyAgent(proxy.url);
  const urls=await runGallery(url,proxy.url,dir);let total=0;const slides=[],signal=AbortSignal.timeout(90000);
  for(const link of urls){const image=await getImage(link,dispatcher,signal,LIMIT-total);total+=image.length;slides.push(image);}
  return slides;
 }finally{active--;if(dispatcher)await dispatcher.close().catch(()=>{});if(proxy)proxy.close();if(dir)await fs.rm(dir,{recursive:true,force:true});}
}
async function sendSlides(ctx,url){
 try{const slides=await downloadSlides(url);for(let i=0;i<slides.length;i++){if(i)await new Promise(r=>setTimeout(r,1000));await ctx.sock.sendMessage(ctx.chat,{image:slides[i],mimetype:'image/jpeg',caption:ctx.box(`🖼️ TikTok slide ${i+1}/${slides.length}\nSource: TikTok via gallery-dl`)},{quoted:ctx.msg});ctx.markReplied?.();}}
 catch(e){const msg=e.message.includes('Too many slides')?`⚠️ This post has more than ${MAX_SLIDES} slides; the bot cannot send the complete slideshow safely.`:e.message.includes('size limit')?'⚠️ The slideshow exceeds the 50 MB limit.':e.message.includes('busy')?'⏳ Gallery downloader is busy. Try again shortly.':e.message.includes('not installed')||e.code==='ENOENT'?'⚠️ Slideshow download is unavailable right now. Please try again later.':'⚠️ Could not download all slides. Try another public TikTok photo post. Source: TikTok via gallery-dl.';await ctx.reply(msg);}
}
module.exports={validTikTokPhoto,downloadSlides,sendSlides,MAX_SLIDES,LIMIT};
