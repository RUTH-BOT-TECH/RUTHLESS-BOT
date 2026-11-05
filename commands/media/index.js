const sharp=require('sharp');
const {createCanvas}=require('@napi-rs/canvas');
const config=require('../../config');
const media=require('../../lib/media');
const defaults={category:'media',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:0};
const cmd=(name,aliases,description,usage,run)=>({...defaults,name,aliases,description,usage,run});
const usage=(c,text,ex)=>c.reply(`⚠️ Usage: ${config.prefix}${text}\nExample: ${config.prefix}${ex}`);
async function requireMedia(ctx,types,usageText) {
  const msg=media.sourceMessage(ctx.msg), info=media.mediaInfo(msg);
  if (!info || !types.includes(info.type)) { await usage(ctx,usageText,`${usageText.split(' ')[0]} (reply to ${types.join(' or ')})`); return null; }
  if (Number(info.data.fileLength||0)>media.LIMIT) {await ctx.reply('⚠️ Media exceeds the 50 MB limit.');return null;}
  // Video conversion, uploads and local AI can take substantially longer than quick image edits.
  if (info.type==='video' || info.type==='audio' || ['tourl','upload','tourl2','imgtourl','removebg','remove-bg'].includes(ctx.invoked)) await ctx.reply('⏳ Working…');
  try {return {msg,info,buffer:await media.download(ctx.sock,msg)};}
  catch(e) {await ctx.reply(e.message.includes('50 MB')?'⚠️ Media exceeds the 50 MB limit.':'⚠️ Could not download this media. Try another message.');return null;}
}
async function output(ctx,content) {await ctx.sock.sendMessage(ctx.chat,content,{quoted:ctx.msg});ctx.markReplied();}
const commands=[
 cmd('sticker',['s','stickergif'],'Make an image or short video into a sticker.','sticker <reply to image or video>',async ctx=>{
  const input=await requireMedia(ctx,['image','video'],'sticker <reply to image or video>');if(!input)return;
  try {
   let result;
   if(input.info.type==='image') result=await media.stickerImage(input.buffer,config.stickerPack,config.stickerAuthor);
   else {
    const webp=await media.convert(input.buffer,'webp',['-vf','fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p','-an','-c:v','libwebp','-loop','0','-quality','75'],{maxDuration:10});
    result=await media.withExif(webp,config.stickerPack,config.stickerAuthor);
   }
   await output(ctx,{sticker:result});
  } catch(e) {await ctx.reply(`⚠️ ${e.message.includes('10 seconds')?e.message:'Could not create sticker. Check the media and try again.'}`);}
 }),
 cmd('take',['stickerwm','swm','wm'],'Replace a sticker’s pack and author metadata.','take pack|author (reply to sticker)',async ctx=>{
  const parts=ctx.args.join(' ').split('|').map(x=>x.trim()); if(parts.length!==2 || !parts[0] || !parts[1] || parts.some(x=>x.length>60))return usage(ctx,'take pack|author (reply to sticker)','take My Pack|My Name');
  const input=await requireMedia(ctx,['sticker'],'take pack|author'); if(!input)return;
  try {await output(ctx,{sticker:await media.withExif(input.buffer,parts[0],parts[1])});}catch{await ctx.reply('⚠️ Could not update sticker metadata.');}
 }),
 cmd('toimg',[],'Convert a sticker to PNG.','toimg <reply to sticker>',async ctx=>{
  const i=await requireMedia(ctx,['sticker'],'toimg <reply to sticker>');if(!i)return;
  try {await output(ctx,{image:await sharp(i.buffer,{limitInputPixels:40000000}).png().toBuffer(),caption:ctx.box('✅ Converted to PNG.')});}catch{await ctx.reply('⚠️ Could not convert this sticker to PNG.');}
 }),
 cmd('tovideo',['togif'],'Convert an animated sticker to MP4.','tovideo <reply to sticker>',async ctx=>{
  const i=await requireMedia(ctx,['sticker'],'tovideo <reply to sticker>');if(!i)return;
  try {const meta=await sharp(i.buffer,{animated:true,limitInputPixels:40000000}).metadata(); if(!meta.pages || meta.pages<2)return ctx.reply('⚠️ This sticker is not animated.');
   const gif=await sharp(i.buffer,{animated:true,limitInputPixels:40000000}).gif().toBuffer();
   const video=await media.convert(gif,'mp4',['-movflags','+faststart','-pix_fmt','yuv420p','-c:v','libx264']);
   await output(ctx,{video,gifPlayback:ctx.invoked==='togif',caption:ctx.box('✅ Converted sticker.')});
  }catch{await ctx.reply('⚠️ Could not convert this animated sticker.');}
 }),
 cmd('tomp3',['toaudio'],'Extract MP3 audio from video or audio.','tomp3 <reply to video or audio>',async ctx=>{
  const i=await requireMedia(ctx,['video','audio'],'tomp3 <reply to video or audio>');if(!i)return;
  try {const audio=await media.convert(i.buffer,'mp3',['-vn','-c:a','libmp3lame','-b:a','128k']);await output(ctx,{audio,mimetype:'audio/mpeg'});}
  catch{await ctx.reply('⚠️ Could not extract audio; the input may have no audio track.');}
 }),
 cmd('tomp4',[],'Convert replied video to MP4.','tomp4 <reply to video>',async ctx=>{
  const i=await requireMedia(ctx,['video'],'tomp4 <reply to video>');if(!i)return;
  try {const video=await media.convert(i.buffer,'mp4',['-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart']);await output(ctx,{video,caption:ctx.box('✅ Converted to MP4.')});}
  catch{await ctx.reply('⚠️ Could not convert this video to MP4.');}
 }),
 cmd('tovn',[],'Convert audio to a WhatsApp voice note.','tovn <reply to audio>',async ctx=>{
  const i=await requireMedia(ctx,['audio'],'tovn <reply to audio>');if(!i)return;
  try {const audio=await media.convert(i.buffer,'ogg',['-vn','-c:a','libopus','-b:a','48k']);await output(ctx,{audio,mimetype:'audio/ogg; codecs=opus',ptt:true});}
  catch{await ctx.reply('⚠️ Could not convert this audio to a voice note.');}
 }),
 cmd('tourl',['upload','tourl2','imgtourl'],'Upload replied media to Uguu for a temporary public link.','tourl <reply to media>',async ctx=>{
  const i=await requireMedia(ctx,['image','video','audio','document','sticker'],'tourl <reply to media>');if(!i)return;
  try {
   const mime=i.info.data.mimetype || ({image:'image/jpeg',video:'video/mp4',audio:'audio/ogg',sticker:'image/webp',document:'application/octet-stream'})[i.info.type];
   const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','audio/mpeg':'mp3','audio/ogg':'ogg','application/pdf':'pdf'})[mime.split(';')[0]] || 'bin';
   const form=new FormData();form.append('files[]',new Blob([i.buffer],{type:mime}),`ruthless.${ext}`);
   const res=await fetch('https://uguu.se/upload.php',{method:'POST',body:form,headers:{'User-Agent':'Ruthless-MD/1.0'},signal:AbortSignal.timeout(60000)});
   if(!res.ok)throw Error();const json=await res.json();const url=json.files?.[0]?.url;
   if(!json.success || !url || new URL(url).protocol!=='https:')throw Error();
   await ctx.reply(`🔗 ${url}\nSource: Uguu. This is a public, temporary link; anyone with it can access the file.`);
  }catch{await ctx.reply('⚠️ Upload failed. Uguu may be unavailable; try again later.');}
 })
];
const effects={
 blur: (s)=>s.blur(5), sharpen:(s)=>s.sharpen(), contrast:(s)=>s.linear(1.3,-30),
 brighten:(s)=>s.modulate({brightness:1.3}), darken:(s)=>s.modulate({brightness:0.7}),
 grayscale:(s)=>s.grayscale(), sepia:(s)=>s.recomb([[.393,.769,.189],[.349,.686,.168],[.272,.534,.131]]),
 invert:(s)=>s.negate(), flip:(s)=>s.flip(), mirror:(s)=>s.flop(), crop:(s)=>s.resize(512,512,{fit:'cover'}),
 compress:(s)=>s.jpeg({quality:40}), enhance:(s)=>s.normalize().sharpen()
};
for(const [name,transform] of Object.entries(effects)) {
 const aliases=name==='enhance'?['upscale','hd','hdr']:[];
 commands.push(cmd(name,aliases,`Apply the ${name} filter locally.`,`${name} <reply to image>`,async ctx=>{
  const i=await requireMedia(ctx,['image','sticker'],`${name} <reply to image>`);if(!i)return;
  try {let stream=transform(sharp(i.buffer,{limitInputPixels:40000000}).rotate());if(name==='enhance' && ctx.invoked==='upscale'){const meta=await sharp(i.buffer,{limitInputPixels:40000000}).metadata();stream=stream.resize(Math.min(4096,(meta.width||512)*2),Math.min(4096,(meta.height||512)*2),{fit:'inside'});}if(name!=='compress')stream=stream.png();const img=await stream.toBuffer();if(img.length>media.LIMIT)throw Error('size');await output(ctx,{image:img,caption:ctx.box(`✅ ${ctx.invoked} applied${name==='enhance'?' (local image processing, not AI)':''}.`)});}
  catch(e){await ctx.reply(e.message==='size'?'⚠️ Output exceeds 50 MB.':'⚠️ Could not process this image.');}
 }));
}
commands.push(cmd('rotate',[],'Rotate an image by degrees.','rotate [degrees] <reply to image>',async ctx=>{
 const deg=ctx.args.length?Number(ctx.args[0]):90; if(ctx.args.length>1 || !Number.isFinite(deg) || deg < -360 || deg > 360)return usage(ctx,'rotate [degrees]','rotate 90');
 const i=await requireMedia(ctx,['image','sticker'],'rotate [degrees]');if(!i)return;
 try{const image=await sharp(i.buffer,{limitInputPixels:40000000}).rotate(deg,{background:'#00000000'}).png().toBuffer();await output(ctx,{image,caption:ctx.box(`✅ Rotated ${deg}°.`)});}catch{await ctx.reply('⚠️ Could not rotate this image.');}
}));
commands.push(cmd('resize',[],'Resize an image to WIDTHxHEIGHT.','resize <width>x<height> <reply to image>',async ctx=>{
 const match=ctx.args.length===1 && /^(\d{1,4})[xX](\d{1,4})$/.exec(ctx.args[0]);
 if(!match || +match[1]<1 || +match[2]<1 || +match[1]>4096 || +match[2]>4096)return usage(ctx,'resize <width>x<height>','resize 800x600');
 const i=await requireMedia(ctx,['image','sticker'],'resize <width>x<height>');if(!i)return;
 try{const image=await sharp(i.buffer,{limitInputPixels:40000000}).resize(+match[1],+match[2],{fit:'fill'}).png().toBuffer();if(image.length>media.LIMIT)throw Error('size');await output(ctx,{image,caption:ctx.box(`✅ Resized to ${match[1]}×${match[2]}.`)});}catch(e){await ctx.reply(e.message==='size'?'⚠️ Output exceeds 50 MB.':'⚠️ Could not resize this image.');}
}));
commands.push(cmd('circle',['round'],'Crop an image into a transparent circle.','circle <reply to image>',async ctx=>{
 const i=await requireMedia(ctx,['image','sticker'],'circle <reply to image>');if(!i)return;
 try{const mask=Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>');const image=await sharp(i.buffer,{limitInputPixels:40000000}).resize(512,512,{fit:'cover'}).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();await output(ctx,{image,caption:ctx.box('✅ Circular crop.')});}catch{await ctx.reply('⚠️ Could not crop this image.');}
}));
commands.push(cmd('watermark',[],'Add text to the lower corner.','watermark <text> <reply to image>',async ctx=>{
 const text=ctx.args.join(' ').trim();if(!text || text.length>80)return usage(ctx,'watermark <text>','watermark Ruthless');
 const i=await requireMedia(ctx,['image','sticker'],'watermark <text>');if(!i)return;
 try{const base=sharp(i.buffer,{limitInputPixels:40000000}).rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true});const {data,info}=await base.ensureAlpha().raw().toBuffer({resolveWithObject:true});const canvas=createCanvas(info.width,info.height), c=canvas.getContext('2d');const imageData=c.createImageData(info.width,info.height);imageData.data.set(data);c.putImageData(imageData,0,0);const size=Math.max(12,Math.round(info.width/25));c.font=`bold ${size}px sans-serif`;c.textAlign='right';c.lineWidth=Math.max(2,size/8);c.strokeStyle='black';c.fillStyle='white';c.strokeText(text,info.width-10,info.height-12,info.width-20);c.fillText(text,info.width-10,info.height-12,info.width-20);await output(ctx,{image:canvas.toBuffer('image/png'),caption:ctx.box('✅ Watermark added.')});}catch{await ctx.reply('⚠️ Could not watermark this image.');}
}));
commands.push(cmd('meme',['memegen','smeme','mememaker'],'Add top and bottom meme captions.','meme top|bottom <reply to image>',async ctx=>{
 const text=ctx.args.join(' '),parts=text.split('|').map(x=>x.trim());if(parts.length!==2 || !parts.some(Boolean) || parts.some(x=>x.length>100))return usage(ctx,'meme top|bottom','meme Hello|World');
 const i=await requireMedia(ctx,['image','sticker'],'meme top|bottom');if(!i)return;
 try{const {data,info}=await sharp(i.buffer,{limitInputPixels:40000000}).rotate().resize(1280,1280,{fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});const canvas=createCanvas(info.width,info.height),c=canvas.getContext('2d'),image=c.createImageData(info.width,info.height);image.data.set(data);c.putImageData(image,0,0);const size=Math.max(16,Math.floor(info.width/11));c.font=`bold ${size}px sans-serif`;c.textAlign='center';c.lineWidth=Math.max(2,size/10);c.strokeStyle='black';c.fillStyle='white';for(const [str,y] of [[parts[0],size+5],[parts[1],info.height-15]]){c.strokeText(str.toUpperCase(),info.width/2,y,info.width-12);c.fillText(str.toUpperCase(),info.width/2,y,info.width-12);}await output(ctx,{image:canvas.toBuffer('image/png'),caption:ctx.box('✅ Meme created.')});}catch{await ctx.reply('⚠️ Could not create this meme.');}
}));
module.exports=commands;

for(const name of ['ttp','ttp2','ttp3','ttp4','ttp5','attp']) commands.push(cmd(name,[],`Create a ${name==='attp'?'color-changing animated':'text'} sticker locally.`,`${name} <text>`,async ctx=>{
 const text=ctx.args.join(' ').trim();if(!text || text.length>80)return usage(ctx,`${name} <text>`,`${name} Hello world`);
 if(name==='attp') await ctx.reply('⏳ Making animated sticker…');
 try {const renderer=require('../../lib/text-sticker');const sticker=name==='attp'?await renderer.animated(text):await renderer.render(text,name);await output(ctx,{sticker});}
 catch{await ctx.reply('⚠️ Could not render this text sticker. Try shorter text.');}
}));

for(const [name, spec] of Object.entries(require('../../lib/imagefx').effects)) commands.push(cmd(name,spec.aliases,`Apply ${name} to a user's profile picture.`,`${name} [@user|number|reply]`,async ctx=>{
 const {target}=require('../../lib/group'),{clean}=require('../../lib/owner'),fx=require('../../lib/imagefx');
 const id=await target(ctx,{self:true});if(!id)return usage(ctx,`${name} [@user|number|reply]`,`${name} @user`);
 try {const avatar=await fx.getAvatar(ctx.sock,id);const image=await fx.render(name,avatar.buffer,clean(id));await output(ctx,{image,caption:ctx.box(`✨ ${spec.label}: @${clean(id)}${avatar.fallback?'\nUsing default picture.':''}`),mentions:[id]});}
 catch{await ctx.reply('⚠️ Could not create this profile effect.');}
}));

async function fetchEmoji(url, allowedHost) {
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==allowedHost)throw Error('Untrusted source');
 const res=await fetch(u,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('Unavailable');
 if(Number(res.headers.get('content-length')||0)>5*1024*1024)throw Error('Too large');const parts=[];let size=0;
 for await(const chunk of res.body){size+=chunk.length;if(size>5*1024*1024)throw Error('Too large');parts.push(Buffer.from(chunk));}return Buffer.concat(parts);
}
function oneEmoji(text) {
 if(!text || text.length>30 || !/[\p{Emoji_Presentation}\uFE0F\u20E3]/u.test(text))return false;
 return [...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text)].length===1;
}
commands.push(cmd('emojimix',[],'Mix two supported emoji with Google Emoji Kitchen.','emojimix emoji1+emoji2',async ctx=>{
 const parts=ctx.args.join('').split('+');if(parts.length!==2 || !parts.every(oneEmoji))return usage(ctx,'emojimix emoji1+emoji2','emojimix 😃+🔥');
 const url=require('emoji-mixer').default(parts[0],parts[1]);if(!url)return ctx.reply('⚠️ This emoji combination is not available in Emoji Kitchen.');
 try{const image=await fetchEmoji(url,'www.gstatic.com');await output(ctx,{image,caption:ctx.box(`✨ ${parts[0]} + ${parts[1]}\nSource: Google Emoji Kitchen.`)});}catch{await ctx.reply('⚠️ Emoji Kitchen image is unavailable. Try again later.');}
}));
commands.push(cmd('emoji',[],'Show a large Twemoji image.','emoji <emoji>',async ctx=>{
 const emoji=ctx.args.join('');if(!oneEmoji(emoji))return usage(ctx,'emoji <emoji>','emoji 😃');
 const normalized=emoji.includes('\u200d')?emoji:emoji.replaceAll('\ufe0f','');const code=[...normalized].map(c=>c.codePointAt(0).toString(16)).join('-');
 try{const image=await fetchEmoji(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`,'cdn.jsdelivr.net');const enlarged=await sharp(image).resize(512,512).png().toBuffer();await output(ctx,{image:enlarged,caption:ctx.box('✨ Source: Twemoji via jsDelivr.')});}
 catch{await ctx.reply('⚠️ That emoji is unavailable from Twemoji. Try another emoji.');}
}));
commands.push(cmd('removebg',['remove-bg'],'Remove the background locally with IMG.LY.','removebg <reply to image>',async ctx=>{
 const i=await requireMedia(ctx,['image','sticker'],'removebg <reply to image>');if(!i)return;
 try {const image=await require('../../lib/removebg').removeBackground(i.buffer);if(image.length>media.LIMIT)return ctx.reply('⚠️ Output exceeds 50 MB.');await output(ctx,{image,caption:ctx.box('✅ Background removed locally.')});}
 catch(e){await ctx.reply(e.message.includes('busy')?'⚠️ Background removal is busy. Try again shortly.':'⚠️ Could not remove the background. Try a different image.');}
}));
