'use strict';
// Only tiny, fixed, non-secret samples are sent. These are API probes, not command tests.
const fallback=require('./youtube-fallback');
const {boundedBody}=require('./public-files');
async function request(url,options={}) {
 const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok){await r.body?.cancel();throw Error(`HTTP ${r.status}`);}return r;
}
async function text(){
 const r=await request('https://api.llm7.io/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'mistral-Nemo-Instruct-2407',messages:[{role:'user',content:'Reply OK.'}],max_tokens:8,stream:false})});
 const j=JSON.parse((await boundedBody(r,65536)).toString('utf8'));if(!j?.choices?.[0]?.message?.content?.trim())throw Error('No text returned');return 'small text response received';
}
async function image(){
 const r=await request('https://aihorde.net/api/v2/status/models?type=image',{headers:{accept:'application/json'}});
 const j=JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'));if(!Array.isArray(j))throw Error('Unexpected response');
 return 'model-status API responded; image generation not tested';
}
async function audio(){
 const u=new URL('https://translate.google.com/translate_tts');for(const [k,v] of Object.entries({ie:'UTF-8',client:'tw-ob',tl:'en',q:'Hello'}))u.searchParams.set(k,v);
 const r=await request(u,{headers:{'User-Agent':'Mozilla/5.0'}});if(!/^audio\/mpeg(?:;|$)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('Not MP3 audio');}
 const data=await boundedBody(r,2*1024*1024);if(data.length<100||!(data.subarray(0,3).toString()==='ID3'||(data[0]===0xff&&(data[1]&0xe0)===0xe0)))throw Error('Invalid audio');return 'short MP3 received; WhatsApp delivery not tested';
}
async function downloader(){const r=await fallback.probe({timeout:10000});return `${r.status} (${r.detail})`;}
async function check(){
 const jobs=[['Text: LLM7',text],['Image: AI Horde',image],['Audio: Google Translate TTS',audio],[`Downloader: ${fallback.ENDPOINT}`,downloader]];
 return Promise.all(jobs.map(async([name,fn])=>{try{const detail=await fn();return {name,detail};}catch(e){return {name,detail:/^HTTP \d+$/.test(e?.message||'')?e.message:'unavailable, invalid response, or timed out'};}}));
}
module.exports={check,text,image,audio,downloader};
