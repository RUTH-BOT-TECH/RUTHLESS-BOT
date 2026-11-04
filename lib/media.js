const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sharp=require('sharp');
const { Image }=require('node-webpmux');
const ffmpeg=require('ffmpeg-static');
const { inner, context, downloadMediaMessage }=require('./group');
const pino=require('pino');
const log=pino({level:'silent'});
const LIMIT=50*1024*1024;
function sourceMessage(msg) {
  const info=context(msg), m=inner(msg.message);
  if (info.quotedMessage) return {key:{remoteJid:msg.key.remoteJid,id:info.stanzaId,participant:info.participant},message:info.quotedMessage};
  if (m.imageMessage || m.videoMessage || m.audioMessage || m.stickerMessage || m.documentMessage) return msg;
  return null;
}
function mediaInfo(msg) {
  const m=inner(msg?.message);
  for (const type of ['image','video','audio','sticker','document']) if (m[`${type}Message`]) return {type,data:m[`${type}Message`]};
  return null;
}
async function download(sock,msg) {
  const info=mediaInfo(msg); if (!info) throw Error('No supported media');
  if (Number(info.data.fileLength || 0)>LIMIT) throw Error('Media exceeds 50 MB');
  const stream=await downloadMediaMessage(msg,'stream',{}, {logger:log,reuploadRequest:sock.updateMediaMessage});
  const chunks=[]; let size=0;
  for await (const chunk of stream) {size+=chunk.length; if(size>LIMIT) {stream.destroy?.(); throw Error('Media exceeds 50 MB');} chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function runFfmpeg(args,{probe=false}={}) {
  return new Promise((resolve,reject)=>{
    if (!ffmpeg) return reject(Error('ffmpeg is not installed'));
    const proc=spawn(ffmpeg,['-hide_banner','-nostdin',...args],{stdio:['ignore','ignore','pipe']});
    let stderr=''; let timed=false;
    const timer=setTimeout(()=>{timed=true;proc.kill('SIGKILL');},60000);
    proc.stderr.on('data',c=>{if(stderr.length<50000) stderr+=c.toString().slice(0,50000-stderr.length)});
    proc.on('error',e=>{clearTimeout(timer);reject(e)});
    proc.on('close',code=>{clearTimeout(timer); if (timed) return reject(Error('Media conversion timed out')); if (!probe && code!==0) return reject(Error('Media conversion failed')); resolve(stderr);});
  });
}
async function convert(input, extension, args,{maxDuration,trimRange}={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-media-'));
  try {
    const source=path.join(dir,'input'), out=path.join(dir,`output.${extension}`);
    await fs.writeFile(source,input);
    if (maxDuration || trimRange) {
      const info=await runFfmpeg(['-i',source],{probe:true});
      const match=/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info);
      if (!match) throw Error('Cannot determine media duration');
      const duration=+match[1]*3600 + +match[2]*60 + +match[3];
      if (maxDuration && duration>maxDuration+0.05) throw Error(`Media must be ${maxDuration} seconds or shorter`);
      if (trimRange && (!Number.isFinite(trimRange.start) || !Number.isFinite(trimRange.end) || trimRange.start<0 || trimRange.start>=trimRange.end || trimRange.start>=duration || trimRange.end>duration+0.05)) throw Error('Trim range must be within the actual clip');
    }
    await runFfmpeg(['-y','-threads','2','-i',source,...args,'-fs',String(LIMIT+1),out]);
    const stat=await fs.stat(out); if (stat.size>LIMIT) throw Error('Media exceeds 50 MB');
    return await fs.readFile(out);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}
function stickerExif(pack,author) {
  const json=Buffer.from(JSON.stringify({'sticker-pack-id':'ruthless-md','sticker-pack-name':pack,'sticker-pack-publisher':author,'emojis':['✨']}));
  const header=Buffer.from([0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
  header.writeUInt32LE(json.length,14); return Buffer.concat([header,json]);
}
async function withExif(buffer, pack, author) { const image=new Image(); await image.load(buffer); image.exif=stickerExif(pack,author); return image.save(null); }
async function stickerImage(buffer,pack,author) {
  const webp=await sharp(buffer,{limitInputPixels:40000000}).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:80}).toBuffer();
  return withExif(webp,pack,author);
}
function xml(text) { return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
module.exports={LIMIT,sourceMessage,mediaInfo,download,runFfmpeg,convert,withExif,stickerImage,xml};
