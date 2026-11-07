const dl=require('../../lib/downloader');
const config=require('../../config');
const {convert,LIMIT}=require('../../lib/media');
const base={category:'downloaders',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:10};
const make=(name,aliases,description,usage,run)=>({...base,name,aliases,description,usage,run});
const specs=[
 ['ytmp4',[],'youtube','video'],['ytmp3',[],'youtube','audio'],['ytdoc',[],'youtube','document'],['ytshort',[],'youtube','video'],
 ['tiktok',['tiktoknowm'],'tiktok','video'],['tiktokmp3',[],'tiktok','audio'],['instagram',['igdl','igreel','igtv'],'instagram','video'],
 ['facebook',['fbdl','fbreel'],'facebook','video'],['twitter',['twdl'],'twitter','video'],['pinterest',['pindl'],'pinterest','video'],
 ['soundcloud',['scdl'],'soundcloud','audio'],['reddit',[],'reddit','video'],['vimeo',[],'vimeo','video'],['dailymotion',[],'dailymotion','video'],
 ['twitch',[],'twitch','video'],['bilibili',[],'bilibili','video'],['odysee',[],'odysee','video'],['tumblr',[],'tumblr','video'],['linkedin',[],'linkedin','video'],
 ['vk',[],'vk','video'],['ok-ru',[],'okru','video'],['rumble',[],'rumble','video'],['bandcamp',[],'bandcamp','audio'],
 ['mixcloud',[],'mixcloud','audio'],['snapchat',[],'snapchat','video'],['likee',[],'likee','video'],['telegramdl',[],'telegram','video']
];
const bySite={};for(const [name,,site,mode] of specs) if(!bySite[site] && mode!=='document')bySite[site]={name,mode};
const commands=[];
function getError(e) {
 if(e.code==='YOUTUBE_BOT_CHECK')return '⚠️ YouTube is asking this server to verify it is not a bot. The download is unavailable right now.';
 if(e.code==='RATE_LIMITED')return '⚠️ The download provider is rate-limiting requests. Please try again later.';
 if(e.code==='ACCESS_DENIED')return '⚠️ The download provider denied access. Please try another public link later.';
 if(e.message.includes('50 MB')||e.message.includes('too large'))return '⚠️ This file is too large or could not be downloaded within the 50 MB limit.';
 if(e.message.includes('busy'))return '⏳ Downloader is busy. Try again shortly.';
 return '⚠️ Download unavailable right now. Please try another public link later.';
}
async function sendResult(ctx,link,site,mode,requested,options={}) {
 try {
  const result=await dl.download(link,site,mode==='audio'?'audio':'video');
  let data=result.data, ext=result.ext;
  if(mode!=='audio' && !['mp4'].includes(ext)) {data=await convert(data,'mp4',['-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart']);ext='mp4';}
  if(data.length>LIMIT)throw Error('Media exceeds 50 MB');
  const caption=ctx.box(`✅ ${result.title||requested||'Downloaded media'}\nSize: ${(data.length/1024/1024).toFixed(2)} MB\nSource: ${site} via ${result.source||'yt-dlp'}`);
  if(mode==='audio') {
   await ctx.sock.sendMessage(ctx.chat,{audio:data,mimetype:'audio/mpeg'},{quoted:ctx.msg});
   await ctx.reply(`🎵 ${result.title||requested||'Downloaded audio'}\nSize: ${(data.length/1024/1024).toFixed(2)} MB\nSource: ${site} via ${result.source||'yt-dlp'}${options.note ? `\n${options.note}` : ''}`);
  }else if(mode==='document')await ctx.sock.sendMessage(ctx.chat,{document:data,mimetype:'video/mp4',fileName:'video.mp4',caption},{quoted:ctx.msg});
  else await ctx.sock.sendMessage(ctx.chat,{video:data,mimetype:'video/mp4',caption},{quoted:ctx.msg});
  ctx.markReplied();
 }catch(e){await ctx.reply(`${getError(e)}${options.failureNote ? `\n${options.failureNote}` : ''}`);}
}
for(const [name,aliases,site,mode] of specs)commands.push(make(name,aliases,`Download supported public ${site} content using yt-dlp.`,`${name} <${site} URL>`,async ctx=>{
 const link=ctx.args[0];if(ctx.args.length!==1||!dl.validLink(link,site))return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <${site} URL>\nExample: ${config.prefix}${name} ${site==='youtube'?'https://www.youtube.com/watch?v=jNQXAC9IVRw':`https://${dl.domains[site][0]}/...`}`);
 await ctx.reply('⏳ Downloading…');await sendResult(ctx,link,site,mode);
}));
for(const [name,aliases,mode] of [['ytplay',['play','song'],'audio'],['video',[],'video']])commands.push(make(name,aliases,'Search YouTube and download the first result using yt-dlp.',`${name} <search terms>`,async ctx=>{
 const query=ctx.args.join(' ').trim();if(!query||query.length>200)return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <search terms>\nExample: ${config.prefix}${name} Me at the zoo`);
 await ctx.reply('⏳ Searching and downloading…');
 try{if(dl.validLink(query,'youtube'))return await sendResult(ctx,query,'youtube',mode);const [found]=await dl.searchYoutube(query,1);if(!found)return ctx.reply('⚠️ No YouTube results found.');await sendResult(ctx,found.url,'youtube',mode,found.title);}catch(e){await ctx.reply(getError(e));}
}));
commands.push(make('yts',['ytsearch'],'Search YouTube for up to five results using yt-dlp.','yts <search terms>',async ctx=>{
 const query=ctx.args.join(' ').trim();if(!query||query.length>200)return ctx.reply(`⚠️ Usage: ${config.prefix}yts <search terms>\nExample: ${config.prefix}yts Me at the zoo`);
 try{const result=await dl.searchYoutube(query,5);if(!result.length)return ctx.reply('⚠️ No YouTube results found.');await ctx.reply(`🔎 YouTube results\n${result.map((r,i)=>`${i+1}. ${r.title}\n${r.url}`).join('\n')}\nSource: ${result.source||'yt-dlp'}`);}catch(e){await ctx.reply(getError(e));}
}));
module.exports=commands;
module.exports.bySite=bySite;
module.exports.sendResult=sendResult;
