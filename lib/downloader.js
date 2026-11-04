const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const ffmpeg=require('ffmpeg-static');
const {createSafeProxy}=require('./safe-proxy');
const LIMIT=50*1024*1024;
let activeJobs=0;
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
function runYtdlp(args,opts={}) {
 return new Promise((resolve,reject)=>{
  const python=process.env.PYTHON_BIN || 'python3'; const proc=spawn(python,['-m','yt_dlp','--ignore-config','--no-plugin-dirs','--no-remote-components','--no-warnings','--socket-timeout','12','--retries','1',...args],{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONNOUSERSITE:'1'}});
  let out='',err='',expired=false;const timer=setTimeout(()=>{expired=true;proc.kill('SIGKILL');},opts.timeout||120000);
  proc.stdout.on('data',c=>{out+=c.toString();if(out.length>2*1024*1024){proc.kill('SIGKILL');}});
  proc.stderr.on('data',c=>{if(err.length<10000)err+=c.toString().slice(0,10000-err.length)});
  proc.on('error',e=>{clearTimeout(timer);reject(e)});
  proc.on('close',code=>{clearTimeout(timer);if(expired)return reject(Error('Downloader timed out'));if(code!==0)return reject(Error(err.includes('No module named yt_dlp') ? 'yt-dlp is not installed' : 'Download unavailable'));resolve(out);});
 });
}
async function searchYoutube(query,count=5) {
 if(!query || query.length>200)throw Error('Invalid search');
 if(activeJobs>=2)throw Error('Downloader is busy');activeJobs++;let proxy;
 try {proxy=await createSafeProxy();const raw=await runYtdlp(['--proxy',proxy.url,'--flat-playlist','--dump-single-json','--',`ytsearch${count}:${query}`],{timeout:45000});
  const data=JSON.parse(raw);return (data.entries||[]).filter(x=>x.id && /^[A-Za-z0-9_-]{11}$/.test(x.id)).slice(0,count).map(x=>({title:x.title||'Untitled',url:`https://www.youtube.com/watch?v=${x.id}`}));
 }finally{activeJobs--;if(proxy)proxy.close();}
}
async function download(value,site,format='video',isSearch=false) {
 if(!isSearch && !validLink(value,site))throw Error('Invalid link');
 if(isSearch && (!value || value.length>200))throw Error('Invalid search');
 if(activeJobs>=2)throw Error('Downloader is busy'); activeJobs++;
 let dir,proxy;
 try {
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-dl-'));proxy=await createSafeProxy();
  const arg=isSearch?`ytsearch1:${value}`:value;
  const common=['--proxy',proxy.url,'--no-playlist','--playlist-items','1','--write-info-json','--max-filesize','50M','--no-part','--no-progress','--no-overwrites','--downloader','native','--ffmpeg-location',ffmpeg,'-o',path.join(dir,'download.%(ext)s')];
  const fmt=format==='audio' ? ['-f','bestaudio[filesize<50M]/bestaudio','-x','--audio-format','mp3','--audio-quality','5'] : ['-f','bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best','--merge-output-format','mp4'];
  await runYtdlp([...common,...fmt,'--',arg]);
  const names=await fs.readdir(dir), files=names.filter(n=>/^download\.(mp4|mkv|webm|mp3|m4a)$/i.test(n));
  if(files.length!==1)throw Error('Download unavailable or too large');
  const filename=files[0], stat=await fs.stat(path.join(dir,filename)); if(stat.size>LIMIT)throw Error('Media exceeds 50 MB');
  let title=''; try { const meta=JSON.parse(await fs.readFile(path.join(dir,'download.info.json'),'utf8')); title=String(meta.title||'').slice(0,180); } catch {}
  return {data:await fs.readFile(path.join(dir,filename)),ext:path.extname(filename).slice(1),size:stat.size,title};
 }finally{activeJobs--;if(proxy)proxy.close();if(dir)await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={domains,validLink,searchYoutube,download,runYtdlp,LIMIT};
