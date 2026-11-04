'use strict';const {boundedBody}=require('./public-files'),media=require('./media');
const MAX_CHARS=180,MAX_MP3=2*1024*1024,LANGUAGES=new Set(['en','es','fr','pt','de','it','ar','hi','ja','ko','zh-CN']);let active=0;
async function synthesize(text,lang='en'){
 if(typeof text!=='string'||!text.trim()||Array.from(text).length>MAX_CHARS||!LANGUAGES.has(lang))throw Error('Invalid speech input');
 if(active>=2)throw Error('Speech generator busy');active++;
 try{const url=new URL('https://translate.google.com/translate_tts');for(const [key,value] of Object.entries({ie:'UTF-8',client:'tw-ob',tl:lang,q:text.trim()}))url.searchParams.set(key,value);
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok||!/^audio\/mpeg(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('Speech provider unavailable');}
  const mp3=await boundedBody(response,MAX_MP3);if(mp3.length<100)throw Error('Invalid speech audio');
  const audio=await media.convert(mp3,'ogg',['-vn','-c:a','libopus','-b:a','32k','-ar','48000','-ac','1']);if(audio.subarray(0,4).toString()!=='OggS')throw Error('Invalid Opus audio');return audio;
 }finally{active--;}
}
module.exports={synthesize,LANGUAGES,MAX_CHARS,MAX_MP3};
