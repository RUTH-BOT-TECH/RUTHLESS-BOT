'use strict';
const fs=require('node:fs'),runtime=require('./python-runtime');
const staticFfmpeg=require('ffmpeg-static');
function python(){return runtime.candidates()[0]||'python3';}
async function run(bin,args,{timeout=12000}={}){return runtime.exec(bin,args,{timeout});}
async function detect(){
 const moduleResult=await runtime.modulePython('yt_dlp');let yt=moduleResult?{kind:'module',bin:moduleResult.bin,version:moduleResult.version}:null;
 if(!yt){const cli=await run('yt-dlp',['--version']);if(cli.ok)yt={kind:'cli',bin:'yt-dlp',version:cli.output.trim().split('\n')[0]};}
 const staticOk=staticFfmpeg&&await run(staticFfmpeg,['-version']);const systemOk=staticOk?.ok?null:await run('ffmpeg',['-version']);
 return {yt,ffmpeg:!!(staticOk?.ok||systemOk?.ok),ffmpegPath:staticOk?.ok?staticFfmpeg:systemOk?.ok?'ffmpeg':null};
}
let startPromise,lastFailure=0;
async function startup(){
 let found=await detect(),setup=null;
 if(!found.yt){console.warn('[YouTube] yt-dlp missing; attempting automatic local setup.');setup=await runtime.setup();if(setup.ok)found=await detect();}
 if(!found.yt)console.warn('[YouTube] Automatic setup did not produce a usable yt-dlp. Owner will receive a private notice.');
 if(!found.ffmpeg)console.warn('[YouTube] ffmpeg not found. Owner will receive a private notice.');
 let updated=null;
 if(found.yt&&process.env.YT_DLP_AUTO_UPDATE!=='off'){
  let update;
  if(found.yt.kind==='module'&&fs.existsSync(runtime.BASE))update=await runtime.updateManaged(found.yt.bin);
  else {const args=found.yt.kind==='module'?['-m','pip','install','--upgrade','yt-dlp[default]','--disable-pip-version-check','--no-input']:['-U'];update=await run(found.yt.bin,args,{timeout:60000});}
  updated=update.ok;if(!update.ok)console.warn('[YouTube] Automatic yt-dlp update failed; continuing with the installed version.');else console.log('[YouTube] yt-dlp startup update completed.');
 }
 return {...found,updated,setup};
}
function ensureStartup(){
 if(startPromise&&lastFailure&&Date.now()-lastFailure>=5*60*1000){startPromise=null;lastFailure=0;}
 if(!startPromise)startPromise=startup().catch(()=>({yt:null,ffmpeg:false,updated:false})).then(result=>{lastFailure=result.yt?0:Date.now();return result;});
 return startPromise;
}
const guidance='⚠️ The bot could not automatically prepare its YouTube downloader. Check Render build and runtime logs for [YouTube]. The host needs compatible Python 3 (3.10+) and pip, network access to Python packages, and writable project storage. FFmpeg is also required. No action is needed from ordinary users. Keep YT_COOKIES private.';
module.exports={python,run,detect,ensureStartup,guidance};
