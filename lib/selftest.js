'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const runFile=promisify(execFile),sharp=require('sharp');
const ROOT=path.join(__dirname,'..'),TIMEOUT=12000,BATCH=2;
// All owner/host operations and group-changing commands are excluded, not run.
const blocked=new Set(('selftest apicheck fflike savestatus report groupstatus gstatusopt gpostall add kick promote demote ban unban mute unmute lock unlock announce tagall hidetag tagadmins tag warn unwarn resetwarn revoke setname setdesc setpp delpp slowmode poll vote endvote welcome setwelcome goodbye setgoodbye antilink antispam antibadword antitoxic antiflood antitag antimention antichannel antiforward antimedia antisticker antiimage antivideo antiaudio antidoc antilongtext addbadword delbadword antidelete antiviewonce antifake allowcountry botprefix antibot antistatus antiporn eventimg chatbot antipromote antidemote antileave broadcastopt delmsg editmsg pinmsg forward viewonce vv2 tourl shorturl').split(' '));
function skip(c){
 if(c.ownerOnly||c.category==='owner')return 'Owner/host command excluded for safety';
 if(c.category==='group'&&!new Set(['inactive','groupinfo','grouplink','warnings','listwarn']).has(c.name))return 'Group-changing or group-posting command excluded for safety';
 const unsafe=new Set(['shell','eval','rm','mv','portscan','broadcast','shutdown','restart','reboot','update','kick','ban','unban','add','promote','demote']);
 if(blocked.has(c.name)||unsafe.has(c.name)||(c.aliases||[]).some(x=>unsafe.has(x)))return 'Disruptive, posting, upload or state-changing command excluded';return null;
}
async function stage(){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-selftest-')),source=path.join(base,'source');
 try{
  await fs.mkdir(path.join(source,'node_modules'),{recursive:true});
  for(const dir of ['commands','lib'])await fs.cp(path.join(ROOT,dir),path.join(source,dir),{recursive:true,filter:async p=>!(await fs.lstat(p)).isSymbolicLink()});
  for(const file of ['config.js','package.json','handler.js'])await fs.copyFile(path.join(ROOT,file),path.join(source,file));
  for(const dir of ['assets/ocr','assets/menu'])try{await fs.cp(path.join(ROOT,dir),path.join(source,dir),{recursive:true,filter:async p=>!(await fs.lstat(p)).isSymbolicLink()});}catch{}
  for(const file of ['assets/default-pfp.jpg','assets/menu.jpg'])try{await fs.mkdir(path.dirname(path.join(source,file)),{recursive:true});await fs.copyFile(path.join(ROOT,file),path.join(source,file));}catch{}
  const fixtures=path.join(source,'selftest-fixtures');await fs.mkdir(fixtures);
  const pixels=sharp({create:{width:64,height:64,channels:3,background:'#76a7ce'}});await pixels.png().toFile(path.join(fixtures,'sample.png'));
  await sharp(path.join(fixtures,'sample.png')).webp().toFile(path.join(fixtures,'sample.webp'));
  // Local generated media only; FFmpeg receives no URLs, credentials or user data.
  try{const ffmpeg=require('ffmpeg-static')||'ffmpeg';await Promise.all([
   runFile(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=64x64:r=10:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(fixtures,'sample.mp4')],{timeout:10000}),
   runFile(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1',path.join(fixtures,'sample.wav')],{timeout:10000})
  ]);}catch{/* media tests report inconclusive when a fixture is unavailable */}
  return {base,source};
 }catch(e){await fs.rm(base,{recursive:true,force:true});throw e;}
}
async function rootFor(base,n){const root=path.join(base,`root-${n}`);for(const dir of ['usr','app','tmp','dev','etc'])await fs.mkdir(path.join(root,dir),{recursive:true});for(const file of ['null','zero','random','urandom'])await fs.writeFile(path.join(root,'dev',file),'');for(const [name,target] of [['bin','usr/bin'],['sbin','usr/sbin'],['lib','usr/lib'],['lib64','usr/lib64']])await fs.symlink(target,path.join(root,name));return root;}
function cleanDetail(s){return String(s||'').replace(/[\r\n\t]+/g,' ').slice(0,180);}
async function isolated(staged,c,index){
 const root=await rootFor(staged.base,index),node=process.execPath.startsWith('/usr/')?process.execPath:'/usr/local/bin/node';
 return new Promise(resolve=>{
  let done=false,out='',err='',p,timer;
  const finish=r=>{if(done)return;done=true;clearTimeout(timer);resolve(r);};
  try{p=spawn('unshare',['--user','--map-root-user','--mount','--net','--pid','--fork','/bin/sh',path.join(ROOT,'lib/selftest-enter.sh'),root,staged.source,path.join(ROOT,'node_modules'),node,c.name],{detached:true,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',NODE_ENV:'production',HOST_COMMANDS:'off',YT_DLP_AUTO_UPDATE:'off'},stdio:['ignore','pipe','pipe']});}catch{return finish({status:'unverified',detail:'Isolation could not start'});}
  timer=setTimeout(()=>{try{process.kill(-p.pid,'SIGKILL');}catch{}finish({status:'unverified',detail:'Isolated execution timed out'});},TIMEOUT);
  p.stdout.on('data',b=>{if(out.length<65536)out+=b.toString().slice(0,65536-out.length);});p.stderr.on('data',b=>{if(err.length<4096)err+=b.toString().slice(0,4096-err.length);});
  p.on('error',()=>finish({status:'unverified',detail:'Isolation tools unavailable'}));
  p.on('close',code=>{const match=out.match(/SELFTEST_RESULT (\{[^\n]+\})/);if(code!==0||!match)return finish({status:'unverified',detail:'OS isolation unavailable or worker failed to start'});try{let r=JSON.parse(match[1]);if(!['working','failed','key','unverified'].includes(r.status))throw Error();if(r.status==='key'&&process.env[r.detail])r={status:'unverified',detail:`${r.detail} configured but withheld from isolated test`};finish({status:r.status,detail:cleanDetail(r.detail)});}catch{finish({status:'unverified',detail:'Invalid worker result'});}});
 });
}
function report(rows,meta={}){
 const counts={working:0,failed:0,key:0,skipped:0,unverified:0};for(const r of rows)counts[r.status]++;
 const symbol={working:'✅ working',failed:'❌ failed',key:'🔑 needs a key',skipped:'⏭️ skipped',unverified:'❔ unverified'};
 const lines=['RUTHLESS MD SELFTEST',`Generated: ${new Date().toISOString()}`,`Unique commands: ${rows.length}; aliases are listed with their command.`,
  'Synthetic local execution only; this does not verify live WhatsApp delivery or network APIs.',
  'Owner/host, disruptive actions and real posts are never executed. Each test uses fake socket and in-memory state.',
  'Isolation requires Linux user/mount/network/PID namespaces and chroot. If unavailable, tests fail closed.',
  'Unverified means a safety restriction, incomplete fixture, timeout or lack of a conclusive result—not a working or failed claim.',
  ...(meta.note?[`Note: ${meta.note}`]:[]),''];
 const groups=new Map();for(const r of rows){if(!groups.has(r.category))groups.set(r.category,[]);groups.get(r.category).push(r);}
 for(const [category,items] of [...groups].sort(([a],[b])=>a.localeCompare(b))){lines.push(`=== ${category.toUpperCase()} ===`);for(const r of items)lines.push(`${symbol[r.status]} | .${r.name}${r.aliases.length?' (aliases: '+r.aliases.map(a=>'.'+a).join(', ')+')':''} | ${r.detail}`);lines.push('');}
 const summary=`✅ ${counts.working} working | ❌ ${counts.failed} failed | 🔑 ${counts.key} need key | ⏭️ ${counts.skipped} skipped | ❔ ${counts.unverified} unverified`;
 lines.push(summary);return {text:lines.join('\n')+'\n',summary,counts};
}
async function run(commands,{progress=async()=>{}}={}){
 const list=[...new Set(commands.values())].filter(c=>c&&typeof c.name==='string').sort((a,b)=>(a.category||'other').localeCompare(b.category||'other')||a.name.localeCompare(b.name));
 const rows=[],items=list.map(c=>({command:c,skip:skip(c)}));let staged,available=false,note='';
 try{staged=await stage();const safety=await isolated(staged,{name:'__safety_probe'},'safety');const probe=safety.status==='working'?await isolated(staged,{name:'ping'},'probe'):safety;available=probe.status==='working';if(!available)note='Secure OS isolation unavailable; runnable commands were not executed.';}catch{note='Could not prepare secure test environment; runnable commands were not executed.';}
 try{
  for(let i=0;i<items.length;i+=BATCH){const batch=items.slice(i,i+BATCH);const results=await Promise.all(batch.map(async({command,skip:reason},j)=>{
   let r=reason?{status:'skipped',detail:reason}:!available?{status:'unverified',detail:'Secure OS isolation unavailable'}:await isolated(staged,command,i+j);
   return {name:command.name,category:command.category||'other',aliases:command.aliases||[],...r};
  }));
  rows.push(...results);if(Math.floor((rows.length-results.length)/50)<Math.floor(rows.length/50))try{await progress(rows.length,items.length);}catch{}
  if(available&&i+BATCH<items.length)await new Promise(r=>setTimeout(r,100));
  }
  return report(rows,{note});
 }finally{if(staged)await fs.rm(staged.base,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={run,report,skip,stage,isolated};
