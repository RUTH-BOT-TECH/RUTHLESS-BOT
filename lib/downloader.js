const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createSafeProxy}=require('./safe-proxy');
const runtime=require('./python-runtime');
const health=require('./downloader-health'),fallback=require('./youtube-fallback'),webSearch=require('./youtube-search');
const LIMIT=50*1024*1024;
// yt-dlp enables Deno by default, but Node must be explicitly enabled.
// Its EJS solver requires Node 22 or later; use the same trusted executable
// that runs the bot rather than resolving an arbitrary binary from PATH.
function youtubeJsArgs() {
 return Number(process.versions.node.split('.')[0])>=22 ? ['--js-runtimes',`node:${process.execPath}`] : [];
}
let activeJobs=0;
// Classify stderr without exposing URLs, cookies, filesystem paths, or other
// untrusted process output in WhatsApp messages or host logs.
function ytdlpError(stderr) {
 const text=String(stderr || '');
 let code='DOWNLOAD_FAILED';
 if (/sign in to confirm.{0,40}not a bot|confirm you(?:['’])?re not a bot/i.test(text)) code='YOUTUBE_BOT_CHECK';
 else if (/HTTP Error 429|too many requests/i.test(text)) code='RATE_LIMITED';
 else if (/HTTP Error 403|forbidden/i.test(text)) code='ACCESS_DENIED';
 else if (/larger than max-filesize|file is larger than|max-filesize.*exceeded/i.test(text)) code='FILE_TOO_LARGE';
 const error=new Error(code==='FILE_TOO_LARGE'?'Media exceeds 50 MB':'Download unavailable');
 error.code=code;
 return error;
}
const domains={
 youtube:['youtube.com','youtu.be','youtube-nocookie.com'],tiktok:['tiktok.com'],instagram:['instagram.com'],facebook:['facebook.com','fb.watch'],
 twitter:['x.com','twitter.com'],pinterest:['pinterest.com','pin.it'],soundcloud:['soundcloud.com'],reddit:['reddit.com','redd.it','v.redd.it'],
 vimeo:['vimeo.com'],dailymotion:['dailymotion.com','dai.ly'],twitch:['twitch.tv','clips.twitch.tv'],bilibili:['bilibili.com','b23.tv'],
 odysee:['odysee.com','lbry.tv'],tumblr:['tumblr.com'],linkedin:['linkedin.com'],vk:['vk.com','vkvideo.ru'],okru:['ok.ru'],rumble:['rumble.com'],
 bandcamp:['bandcamp.com'],mixcloud:['mixcloud.com'],snapchat:['snapchat.com'],likee:['likee.video','likee.com'],telegram:['t.me','telegram.me']
};
function validLink(value,site) {
 try {const u=new URL(value);if(u.protocol!=='https:' || u.username || u.password || u.port || !domains[site])return false;
  return domains[site].some(h=>u.hostname.toLowerCase()===h || u.hostname.toLowerCase().endsWith('.'+h));} catch {return false;}
}
async function runYtdlp(args,opts={}) {
 const status=await health.ensureStartup();if(!status.yt)throw Error('yt-dlp unavailable');
 return new Promise((resolve,reject)=>{
  const env=runtime.safeEnv();const yt=status.yt;const proc=spawn(yt.bin,[...(yt.kind==='module'?['-m','yt_dlp']:[]),'--ignore-config','--no-plugin-dirs','--no-remote-components','--no-warnings','--socket-timeout','12','--retries','1',...args],{stdio:['ignore','pipe','pipe'],env});
  let out='',err='',expired=false;const timer=setTimeout(()=>{expired=true;proc.kill('SIGKILL');},opts.timeout||120000);
  proc.stdout.on('data',c=>{out+=c.toString();if(out.length>2*1024*1024){proc.kill('SIGKILL');}});
  proc.stderr.on('data',c=>{if(err.length<10000)err+=c.toString().slice(0,10000-err.length)});
  proc.on('error',e=>{clearTimeout(timer);reject(e)});
  proc.on('close',code=>{clearTimeout(timer);if(expired)return reject(Error('Downloader timed out'));if(code!==0)return reject(err.includes('No module named yt_dlp') ? Error('yt-dlp is not installed') : ytdlpError(err));resolve(out);});
 });
}
async function searchYoutube(query,count=5) {
 if(!query || query.length>200||!Number.isInteger(count)||count<1||count>10)throw Error('Invalid search');
 if(activeJobs>=2)throw Error('Downloader is busy');activeJobs++;let proxy;
 try {try{proxy=await createSafeProxy();const raw=await runYtdlp(['--proxy',proxy.url,...youtubeJsArgs(),'--flat-playlist','--dump-single-json','--',`ytsearch${count}:${query}`],{timeout:45000});
  const data=JSON.parse(raw);const results=(data.entries||[]).filter(x=>x.id && /^[A-Za-z0-9_-]{11}$/.test(x.id)).slice(0,count).map(x=>({title:x.title||'Untitled',url:`https://www.youtube.com/watch?v=${x.id}`}));results.source='yt-dlp';return results;
 }catch{
  console.warn('[YouTube] Primary search failed. Trying search-page fallback.');
  try{const results=await webSearch.search(query,count);results.source='YouTube search page';return results;}
  catch{console.warn('[YouTube] Search-page fallback failed.');throw Error('YouTube search unavailable');}
 }
 }finally{activeJobs--;if(proxy)proxy.close();}
}
async function cookieFile(dir){const raw=process.env.YT_COOKIES;if(!raw)return null;if(Buffer.byteLength(raw)>180000)throw Error('Invalid cookies');let text=raw.replace(/\\n/g,'\n');if(!text.startsWith('# Netscape HTTP Cookie File')&&!text.startsWith('# HTTP Cookie File')){try{text=Buffer.from(raw,'base64').toString('utf8');}catch{throw Error('Invalid cookies');}}if(!/^# (?:Netscape HTTP Cookie File|HTTP Cookie File)/.test(text)||Buffer.byteLength(text)>128*1024||text.includes('\0'))throw Error('Invalid cookies');const lines=text.split(/\r?\n/),filtered=['# Netscape HTTP Cookie File'];for(const line of lines){if(!line||line.startsWith('#')&&!line.startsWith('#HttpOnly_'))continue;const cols=line.split('\t');const domain=(cols[0]||'').replace(/^#HttpOnly_/,'').replace(/^\./,'').toLowerCase();if(cols.length===7&&(domain==='youtube.com'||domain.endsWith('.youtube.com')||domain==='google.com'||domain.endsWith('.google.com')))filtered.push(line);}if(filtered.length<2)throw Error('Invalid cookies');const filename=path.join(dir,'youtube.cookies');await fs.writeFile(filename,filtered.join('\n')+'\n',{mode:0o600,flag:'wx'});return filename;}
async function localDownload(value,site,format='video',isSearch=false) {
 if(!isSearch && !validLink(value,site))throw Error('Invalid link');
 if(isSearch && (!value || value.length>200))throw Error('Invalid search');
 if(activeJobs>=2)throw Error('Downloader is busy'); activeJobs++;
 let dir,proxy;
 try {
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-dl-'));proxy=await createSafeProxy();
  const arg=isSearch?`ytsearch1:${value}`:value;
  const cookies=site==='youtube'?await cookieFile(dir):null;const status=await health.ensureStartup();if(!status.ffmpegPath)throw Error('ffmpeg unavailable');
  const common=['--proxy',proxy.url,...(site==='youtube'?youtubeJsArgs():[]),'--no-playlist','--playlist-items','1','--write-info-json','--max-filesize','50M','--no-part','--no-progress','--no-overwrites','--downloader','native',...(status.ffmpegPath==='ffmpeg'?[]:['--ffmpeg-location',status.ffmpegPath]),...(cookies?['--cookies',cookies]:[]),'-o',path.join(dir,'download.%(ext)s')];
  const fmt=format==='audio' ? ['-f','bestaudio[filesize<50M]/bestaudio','-x','--audio-format','mp3','--audio-quality','5'] : ['-f','bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best','--merge-output-format','mp4'];
  await runYtdlp([...common,...fmt,'--',arg]);
  const names=await fs.readdir(dir), files=names.filter(n=>/^download\.(mp4|mkv|webm|mp3|m4a)$/i.test(n));
  if(files.length!==1)throw Error('Download unavailable or too large');
  const filename=files[0], stat=await fs.stat(path.join(dir,filename)); if(stat.size>LIMIT)throw Error('Media exceeds 50 MB');
  let title=''; try { const meta=JSON.parse(await fs.readFile(path.join(dir,'download.info.json'),'utf8')); title=String(meta.title||'').slice(0,180); } catch {}
  return {data:await fs.readFile(path.join(dir,filename)),ext:path.extname(filename).slice(1),size:stat.size,title,source:'yt-dlp'};
 }finally{activeJobs--;if(proxy)proxy.close();if(dir)await fs.rm(dir,{recursive:true,force:true});}
}
async function download(value,site,format='video',isSearch=false){
 try{return await localDownload(value,site,format,isSearch);}
 catch(e){
  if(site!=='youtube'||isSearch||!validLink(value,site)||/busy|50 MB|too large|Invalid link/.test(e.message))throw e;
  // Emit only a fixed diagnostic code: subprocess errors may contain secrets.
  const code=['YOUTUBE_BOT_CHECK','RATE_LIMITED','ACCESS_DENIED'].includes(e.code)?e.code:'DOWNLOAD_FAILED';
  console.warn(`[YouTube] Primary download failed: ${code}. Trying fallback.`);
  try{return await fallback.download(value,format);}
  catch{
   console.warn('[YouTube] Fallback download failed.');
   if(code!=='DOWNLOAD_FAILED')throw e;
   throw Error('YouTube download unavailable');
  }
 }
}
module.exports={domains,validLink,searchYoutube,download,runYtdlp,cookieFile,LIMIT};
