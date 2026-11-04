'use strict';
const {ProxyAgent,fetch}=require('undici');
const {createSafeProxy}=require('./safe-proxy');
const {boundedBody}=require('./public-files');
const media=require('./media');
// Only published OtakuGIFs reaction categories; inputs never form arbitrary URLs.
const SUPPORTED=new Set('tickle pat slap punch bite lick cuddle poke wave wink smile laugh cry blush dance sleep happy sad shy scared surprised confused shrug handhold nom pout smug yawn kiss hug mad sip'.split(' '));
let active=0;
const GIFUKAI=new Set(['highfive','bored','think','nod']);
async function gif(reaction='tickle',provider='otakugifs') {
 if(provider==='otakugifs'?!SUPPORTED.has(reaction):provider==='gifukai'?!GIFUKAI.has(reaction):true)throw Error('Unsupported reaction');
 if(active>=2)throw Error('Reaction busy');active++;let proxy,dispatcher;
 try{
  const endpoint=new URL(provider==='gifukai'?`https://api.gifukai.com/v1/${reaction}`:'https://api.otakugifs.xyz/gif');if(provider==='otakugifs'){endpoint.searchParams.set('reaction',reaction);endpoint.searchParams.set('format','gif');}
  const api=await fetch(endpoint,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!api.ok){await api.body?.cancel();throw Error('Reaction API unavailable');}
  const j=JSON.parse((await boundedBody(api,65536)).toString('utf8')),u=new URL(j.url);
  const expectedHost=provider==='gifukai'?'cdn.gifukai.com':'cdn.otakugifs.xyz',expectedPath=provider==='gifukai'?`^/${reaction}/[a-z0-9-]+\\.gif$`:`^/gifs/${reaction}/[a-z0-9]+\\.gif$`;
  if(u.protocol!=='https:'||u.hostname!==expectedHost||u.username||u.password||u.port||u.search||u.hash||!new RegExp(expectedPath,'i').test(u.pathname))throw Error('Unsafe reaction URL');
  proxy=await createSafeProxy();dispatcher=new ProxyAgent(proxy.url);
  const r=await fetch(u,{dispatcher,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok||!/^image\/gif(?:;|$)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('Reaction image unavailable');}
  const bytes=await boundedBody(r,20*1024*1024);
  if(!['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))throw Error('Invalid GIF');
  return await media.convert(bytes,'mp4',['-t','10','-vf','scale=trunc(min(512\\,iw)/2)*2:-2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-an']);
 }finally{if(dispatcher)await dispatcher.close().catch(()=>{});proxy?.close();active--;}
}
module.exports={gif,SUPPORTED};
