'use strict';
const {spawn}=require('node:child_process');
const MAX_OUTPUT=12000,MAX_MS=15000;
function spec(kind,input){
 if(!Array.isArray(input)||!input.length)throw Error('A command or path is required.');
 if(kind==='shell')return {program:'/bin/sh',args:['-c',input.join(' ')]};
 if(kind==='eval')return {program:process.execPath,args:['-e',`(async()=>{try{const result=await eval(process.argv[1]);if(result!==undefined)console.log(require('node:util').inspect(result,{depth:3,maxArrayLength:30}));}catch(e){console.error(String(e));process.exitCode=1}})()`,input.join(' ')]};
 const expected={ls:[1,1],cat:[1,1],rm:[1,1],mv:[2,2],cp:[2,2]}[kind];
 if(!expected||input.length<expected[0]||input.length>expected[1]||input.some(s=>!s||s.startsWith('-')||s.includes('\0')))throw Error('Invalid file command arguments.');
 return {program:kind,args:['--',...input]};
}
function execute(kind,input,{cwd=process.cwd(),timeout=MAX_MS}={}){
 const {program,args}=spec(kind,input);
 return new Promise((resolve,reject)=>{
  const child=spawn(program,args,{cwd,env:process.env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  let output='',truncated=false,timedOut=false,done=false;
  const kill=()=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}};
  const timer=setTimeout(()=>{timedOut=true;kill();},timeout);
  function collect(chunk){if(output.length>=MAX_OUTPUT){truncated=true;return;}const str=chunk.toString('utf8');output+=str.slice(0,MAX_OUTPUT-output.length);if(output.length>=MAX_OUTPUT&&str.length)truncated=true;}
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.once('error',err=>{if(done)return;done=true;clearTimeout(timer);reject(err);});
  child.once('close',(code,signal)=>{if(done)return;done=true;clearTimeout(timer);resolve({output,code,signal,timedOut,truncated});});
 });
}
module.exports={spec,execute,MAX_OUTPUT,MAX_MS};
