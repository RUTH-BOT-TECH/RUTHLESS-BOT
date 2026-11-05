'use strict';
// Private, project-local Python dependencies for Node hosts. No system pip
// writes, sudo, downloaded shell scripts, or credentials passed to pip.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const ROOT=path.join(__dirname,'..'),BASE=path.join(ROOT,'.python-deps'),UPDATES=path.join(ROOT,'.python-deps-updates'),LOCK=path.join(ROOT,'.python-deps.lock');
const INSTALL_TIMEOUT=120000,UPDATE_TIMEOUT=60000,LOCK_WAIT=130000,RETRY_DELAY=5*60*1000;
function candidates(){
 const configured=process.env.PYTHON_BIN;
 const specified=configured&&(/[\\/]/.test(configured)?path.resolve(ROOT,configured):configured);
 const venv=path.join(ROOT,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 return [...new Set([specified,fs.existsSync(venv)?venv:null,'python3','python'].filter(Boolean))];
}
function safeEnv({managed=true,home}={}){
 const env={};for(const k of ['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','LANG','LC_ALL','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE'])if(process.env[k])env[k]=process.env[k];
 env.HOME=home||os.tmpdir();env.PYTHONNOUSERSITE='1';env.PIP_CONFIG_FILE=os.devNull;env.PIP_DISABLE_PIP_VERSION_CHECK='1';env.PIP_NO_INPUT='1';env.PIP_NO_CACHE_DIR='1';
 if(managed){const paths=[UPDATES,BASE].filter(x=>fs.existsSync(x));if(paths.length)env.PYTHONPATH=paths.join(path.delimiter);}
 return env;
}
function exec(bin,args,{timeout=12000,env=safeEnv(),cwd=ROOT}={}){
 return new Promise(resolve=>{let p,timer,done=false,output='';const finish=(ok,code)=>{if(done)return;done=true;clearTimeout(timer);resolve({ok,code,output:output.slice(0,300)});};
  try{p=spawn(bin,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});}catch{return finish(false,null);}
  for(const s of [p.stdout,p.stderr])s.on('data',b=>{if(output.length<300)output+=b.toString().slice(0,300-output.length);});
  p.once('error',()=>finish(false,null));p.once('close',c=>finish(c===0,c));
  timer=setTimeout(()=>{try{if(process.platform==='win32')p.kill('SIGKILL');else process.kill(-p.pid,'SIGKILL');}catch{}finish(false,null);},timeout);timer.unref?.();
 });
}
async function modulePython(name){for(const bin of candidates()){const result=await exec(bin,['-m',name,'--version']);if(result.ok)return {bin,version:result.output.split('\n')[0]};}return null;}
async function importBoth(){for(const bin of candidates()){const x=await exec(bin,['-c','import yt_dlp, gallery_dl']);if(x.ok)return bin;}return null;}
async function pipPython(){for(const bin of candidates()){const version=await exec(bin,['-c','import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)']);if(!version.ok)continue;const pip=await exec(bin,['-m','pip','--version']);if(pip.ok)return bin;}return null;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function acquire(){const until=Date.now()+LOCK_WAIT;while(Date.now()<until){try{await fsp.mkdir(LOCK);return true;}catch(e){if(e.code!=='EEXIST')return false;try{const stat=await fsp.stat(LOCK);if(Date.now()-stat.mtimeMs>10*60*1000){await fsp.rm(LOCK,{recursive:true,force:true});continue;}}catch{}await pause(1000);}}return false;}
async function replace(stage,destination){
 const old=destination+'.old-'+process.pid+'-'+Date.now();let moved=false;
 try{try{await fsp.rename(destination,old);moved=true;}catch(e){if(e.code!=='ENOENT')throw e;}await fsp.rename(stage,destination);if(moved)await fsp.rm(old,{recursive:true,force:true});}
 catch(e){if(moved&&!fs.existsSync(destination))await fsp.rename(old,destination).catch(()=>{});throw e;}
}
async function installTo(python,destination,{update=false}={}){
 const stage=await fsp.mkdtemp(path.join(ROOT,'.python-deps-stage-'));
 try{
  const args=['-m','pip','install','--disable-pip-version-check','--no-input','--no-cache-dir','--target',stage,...(update?['--upgrade','yt-dlp[default]']:['-r',path.join(ROOT,'requirements.txt'),'yt-dlp[default]'])];
  const result=await exec(python,args,{timeout:update?UPDATE_TIMEOUT:INSTALL_TIMEOUT,env:safeEnv({managed:false,home:stage})});
  if(!result.ok)return {ok:false,reason:'Package installation failed or timed out (Python, pip, network or package compatibility).'};
  const env=safeEnv({managed:false,home:stage});env.PYTHONPATH=stage;
  const check=await exec(python,['-c',update?'import yt_dlp':'import yt_dlp, gallery_dl'],{env});
  if(!check.ok)return {ok:false,reason:'Installed packages could not be loaded by Python.'};
  await replace(stage,destination);return {ok:true};
 }catch{return {ok:false,reason:'Local downloader directory could not be prepared.'};}
 finally{await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});}
}
async function setupOnce(){
 if(process.env.DOWNLOADER_AUTO_SETUP==='off')return {ok:false,skipped:true,reason:'Automatic setup disabled.'};
 if(await importBoth())return {ok:true,existing:true};
 if(!await acquire())return {ok:false,reason:'Another installer is running or the local install lock is unavailable.'};
 try{if(await importBoth())return {ok:true,existing:true};const python=await pipPython();if(!python)return {ok:false,reason:'A compatible Python 3 (3.10+) and pip are unavailable.'};return await installTo(python,BASE);}
 finally{await fsp.rm(LOCK,{recursive:true,force:true}).catch(()=>{});}
}
let pendingSetup=null,lastSetupFailure=0;
function setup(){
 if(pendingSetup)return pendingSetup;
 if(lastSetupFailure&&Date.now()-lastSetupFailure<RETRY_DELAY)return Promise.resolve({ok:false,reason:'Automatic setup will retry later.'});
 pendingSetup=setupOnce().then(result=>{lastSetupFailure=!result.ok&&!result.skipped?Date.now():0;return result;}).finally(()=>{pendingSetup=null;});
 return pendingSetup;
}
async function updateManaged(python){if(!await acquire())return {ok:false,reason:'Downloader install lock unavailable.'};try{return await installTo(python,UPDATES,{update:true});}finally{await fsp.rm(LOCK,{recursive:true,force:true}).catch(()=>{});}}
module.exports={ROOT,BASE,UPDATES,candidates,safeEnv,exec,modulePython,importBoth,setup,updateManaged};
