'use strict';
const {resolvePublic}=require('./safe-proxy');
const {boundedBody}=require('./public-files');
const sharp=require('sharp');
let active=0;
function parseUrl(raw){
 if(typeof raw!=='string'||raw.length>2048||/\s/.test(raw))throw Error('Invalid URL');
 if(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)&&!/^https?:\/\//i.test(raw))throw Error('Invalid URL');
 let url;try{url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);}catch{throw Error('Invalid URL');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||(url.port&&!['80','443'].includes(url.port)))throw Error('Invalid URL');
 if(!url.hostname||url.hostname.toLowerCase().endsWith('.local'))throw Error('Invalid URL');
 return url;
}
async function capture(raw){
 const url=parseUrl(raw);if(active>=2)throw Error('Screenshot busy');active++;
 try{
  await Promise.race([resolvePublic(url.hostname),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('DNS timeout')),8000);t.unref();})]);
  const endpoint=`https://image.thum.io/get/noanimate/png/width/1000/${url.href}`;
  const response=await fetch(endpoint,{redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok||!/^image\/png(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('Screenshot provider unavailable');}
  const bytes=await boundedBody(response,10*1024*1024);
  if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('Invalid screenshot');
  const info=await sharp(bytes,{limitInputPixels:40000000}).metadata();if(info.format!=='png')throw Error('Invalid screenshot');
  return bytes;
 }finally{active--;}
}
module.exports={parseUrl,capture};
