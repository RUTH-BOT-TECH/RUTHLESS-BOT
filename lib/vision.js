'use strict';const sharp=require('sharp'),{boundedBody}=require('./public-files');
const MODEL='nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',MAX_INPUT=10*1024*1024,MAX_QUESTION=500,MAX_IMAGE=80000,MAX_BODY=125000;let active=0;
async function prepare(input){
 if(!Buffer.isBuffer(input)||!input.length||input.length>MAX_INPUT)throw Error('Invalid image');const original=sharp(input,{limitInputPixels:40000000}),meta=await original.metadata();if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height)throw Error('Unsupported image');
 for(const [size,quality] of [[512,50],[384,40],[256,35]]){const image=await sharp(input,{limitInputPixels:40000000}).rotate().resize(size,size,{fit:'inside',withoutEnlargement:true}).jpeg({quality}).toBuffer();if(image.length<=MAX_IMAGE)return image;}
 throw Error('Image is too complex to upload');
}
async function describe(input,question){
 if(typeof question!=='string'||!question.trim()||question.length>MAX_QUESTION)throw Error('Invalid question');if(active>=2)throw Error('Vision busy');active++;
 try{const image=await prepare(input),payload={model:MODEL,messages:[{role:'user',content:[{type:'text',text:question.trim()},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image.toString('base64')}}]}],max_tokens:500};const body=JSON.stringify(payload);if(Buffer.byteLength(body)>MAX_BODY)throw Error('Image request too large');
 const r=await fetch('https://blockrun.ai/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},redirect:'error',body,signal:AbortSignal.timeout(60000)});if(!r.ok){await r.body?.cancel();throw Error('Vision provider unavailable');}const data=JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'));const text=data?.choices?.[0]?.message?.content,model=data?.model;if(typeof text!=='string'||!text.trim()||typeof model!=='string'||!model.trim())throw Error('No vision result');return {text:text.trim().slice(0,3500),model:model.replace(/[\r\n]/g,' ').slice(0,100)};
 }finally{active--;}
}
module.exports={prepare,describe,MODEL,MAX_INPUT,MAX_QUESTION,MAX_BODY};
