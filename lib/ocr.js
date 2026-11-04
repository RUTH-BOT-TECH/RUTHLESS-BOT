'use strict';const {spawn}=require('node:child_process'),path=require('node:path');const MAX_IMAGE=10*1024*1024;let active=false;
async function recognize(input){
 if(!Buffer.isBuffer(input)||input.length===0||input.length>MAX_IMAGE)throw Error('Invalid image');if(active)throw Error('OCR busy');active=true;
 try{return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'ocr-worker.js')],{stdio:['pipe','pipe','ignore']});let result='',timed=false,oversized=false,settled=false;const timer=setTimeout(()=>{timed=true;child.kill('SIGKILL');},60000);function finish(err,value){if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);}child.stdout.on('data',chunk=>{result+=chunk.toString();if(result.length>100000){oversized=true;child.kill('SIGKILL');}});child.on('error',()=>finish(Error('OCR process failed')));child.stdin.on('error',()=>{});child.on('close',code=>{if(timed||oversized||code!==0)return finish(Error('OCR failed'));try{const j=JSON.parse(result);if(typeof j.text!=='string')throw Error();finish(null,j.text.slice(0,3000));}catch{finish(Error('OCR response invalid'));}});child.stdin.end(input);});}
 finally{active=false;}
}
module.exports={recognize,MAX_IMAGE};
