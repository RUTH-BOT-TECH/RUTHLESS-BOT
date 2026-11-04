'use strict';
const {load}=require('cheerio');
const {File,API}=require('megajs');
const LIMIT=50*1024*1024;
let active=0;
function checkedUrl(raw,kind) {
  try {
    const u=new URL(raw); if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    const h=u.hostname.toLowerCase();
    if(kind==='mediafire' && (h==='mediafire.com'||h==='www.mediafire.com') && /^\/file\/[A-Za-z0-9]+(?:\/[^/]*)?(?:\/file)?\/?$/.test(u.pathname))return u;
    if(kind==='gdrive' && ['drive.google.com','docs.google.com'].includes(h)) {
      let id;const match=u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/view|\/edit)?\/?$/);
      if(match)id=match[1];else if(['/open','/uc'].includes(u.pathname))id=u.searchParams.get('id');
      if(!id||!/^[A-Za-z0-9_-]{10,200}$/.test(id))return null;
      const resourcekey=u.searchParams.get('resourcekey');if(resourcekey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourcekey))return null;
      return {id,resourcekey};
    }
    if(kind==='mega' && ['mega.nz','mega.co.nz'].includes(h) && (/^\/file\/[A-Za-z0-9_-]{8}$/.test(u.pathname)&&/^#[A-Za-z0-9_-]{43}$/.test(u.hash) || u.pathname==='/' && /^#![A-Za-z0-9_-]{8}![A-Za-z0-9_-]{43}$/.test(u.hash)))return u;
  }catch{} return null;
}
function allowUrl(raw,kind){
 try{const u=new URL(raw),h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  if(kind==='mediafire')return h==='www.mediafire.com'||h==='mediafire.com'||/^download\d+\.mediafire\.com$/.test(h);
  if(kind==='gdrive')return h==='drive.usercontent.google.com'||h==='drive.google.com';
  if(kind==='mega')return /(^|\.)(mega\.co\.nz|mega\.nz)$/.test(h);
 }catch{}return false;
}
async function request(url,kind,signal,options={}) {
 for(let n=0;n<=4;n++){
  if(!allowUrl(url,kind))throw Error('Unsafe download URL');
  const r=await fetch(url,{...options,signal,redirect:'manual'});
  if(r.status>=300&&r.status<400){const loc=r.headers.get('location');await r.body?.cancel();if(!loc)throw Error('Missing redirect');url=new URL(loc,url).href;continue;}
  if(!r.ok){await r.body?.cancel();throw Error('Provider unavailable');}return r;
 }throw Error('Too many redirects');
}
async function boundedBody(r,limit=LIMIT){
 const len=Number(r.headers.get('content-length'));if(Number.isFinite(len)&&len>limit){await r.body?.cancel();throw Error('File exceeds size limit');}
 let size=0,chunks=[];if(!r.body)throw Error('Empty response');
 for await(const chunk of r.body){size+=chunk.length;if(size>limit)throw Error('File exceeds size limit');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
function safeName(name){return String(name||'download').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').replace(/^\.+/,'').trim().slice(0,120)||'download';}
function headerName(header){let v=header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];if(v){try{return decodeURIComponent(v)}catch{}}return header?.match(/filename="([^"]+)"/i)?.[1]||header?.match(/filename=([^;]+)/i)?.[1]?.trim()||null;}
async function mediafire(raw,signal){
 const u=checkedUrl(raw,'mediafire');if(!u)throw Error('Invalid link');
 const page=await request(u.href,'mediafire',signal);const html=(await boundedBody(page,2*1024*1024)).toString('utf8');
 const direct=load(html)('a#downloadButton').attr('href');if(!direct||!allowUrl(direct,'mediafire')||!/^download\d+\.mediafire\.com$/.test(new URL(direct).hostname))throw Error('File link unavailable');
 const r=await request(direct,'mediafire',signal);if((r.headers.get('content-type')||'').toLowerCase().includes('text/html')){await r.body?.cancel();throw Error('Provider returned a webpage');}
 const data=await boundedBody(r);return {data,name:safeName(headerName(r.headers.get('content-disposition'))||decodeURIComponent(new URL(direct).pathname.split('/').pop()||'download'))};
}
async function gdrive(raw,signal){
 const parsed=checkedUrl(raw,'gdrive');if(!parsed)throw Error('Invalid link');
 const u=new URL('https://drive.usercontent.google.com/download');u.searchParams.set('id',parsed.id);u.searchParams.set('export','download');u.searchParams.set('confirm','t');if(parsed.resourcekey)u.searchParams.set('resourcekey',parsed.resourcekey);
 const r=await request(u.href,'gdrive',signal);
 if((r.headers.get('content-type')||'').toLowerCase().includes('text/html')||!/^attachment\b/i.test(r.headers.get('content-disposition')||'')){await r.body?.cancel();throw Error('File unavailable or requires login');}
 const data=await boundedBody(r);return {data,name:safeName(headerName(r.headers.get('content-disposition')))};
}
async function mega(raw,signal){
 if(!checkedUrl(raw,'mega'))throw Error('Invalid link');
 const safeFetch=(url,opts={})=>{if(!allowUrl(url,'mega'))throw Error('Unsafe download URL');return fetch(url,{...opts,redirect:'error',signal:opts.signal?AbortSignal.any([signal,opts.signal]):signal});};
 const api=new API(false,{fetch:safeFetch});let stream;
 try{
  const file=File.fromURL(raw,{api});await file.loadAttributes();
  if(!Number.isSafeInteger(file.size)||file.size<0)throw Error('Invalid size');if(file.size>LIMIT)throw Error('File exceeds size limit');
  stream=file.download({maxConnections:1,forceHttps:true});const chunks=[];let size=0;
  const abort=()=>stream.destroy(Error('Download timed out'));signal.addEventListener('abort',abort,{once:true});
  try{for await(const chunk of stream){size+=chunk.length;if(size>LIMIT||size>file.size)throw Error('File exceeds size limit');chunks.push(Buffer.from(chunk));}}finally{signal.removeEventListener('abort',abort);}
  if(size!==file.size)throw Error('Incomplete download');return {data:Buffer.concat(chunks),name:safeName(file.name)};
 }finally{stream?.destroy();api.close();}
}
async function download(raw,kind){
 if(!['mega','gdrive','mediafire'].includes(kind)||!checkedUrl(raw,kind))throw Error('Invalid link');
 if(active>=2)throw Error('Downloader is busy');active++;
 try{return await ({mediafire,gdrive,mega}[kind])(raw,AbortSignal.timeout(90000));}finally{active--;}
}
async function sendFile(ctx,raw,kind){
 try{const {data,name}=await download(raw,kind);await ctx.sock.sendMessage(ctx.chat,{document:data,mimetype:'application/octet-stream',fileName:name,caption:ctx.box(`✅ ${name}\nSize: ${(data.length/1024/1024).toFixed(2)} MB\nSource: ${kind==='gdrive'?'Google Drive':kind==='mega'?'MEGA':'MediaFire'}`)},{quoted:ctx.msg});ctx.markReplied?.();}
 catch(e){if(e.message.includes('size limit'))await ctx.reply('⚠️ This file is larger than 50 MB.');else if(e.message.includes('busy'))await ctx.reply('⏳ File downloader is busy. Try again shortly.');else await ctx.reply(`⚠️ Could not download, try another public single-file link. Source: ${kind==='gdrive'?'Google Drive':kind==='mega'?'MEGA':'MediaFire'}.`);}
}
module.exports={checkedUrl,allowUrl,boundedBody,safeName,headerName,download,sendFile,LIMIT};
