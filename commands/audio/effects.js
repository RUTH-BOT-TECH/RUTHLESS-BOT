'use strict';
const media=require('../../lib/media'),config=require('../../config');
const filters={bass:'bass=g=12',nightcore:'aresample=44100,asetrate=55125,aresample=44100',earrape:'volume=5,alimiter=limit=0.95',slow:'atempo=0.75',fast:'atempo=1.3','reverse-audio':'areverse',deep:'aresample=44100,asetrate=35280,aresample=44100',robot:"afftfilt=real='hypot(re,im)':imag=0",echo:'aecho=0.8:0.9:250:0.4'};
let active=0;
module.exports=Object.entries(filters).map(([name,filter])=>({name,aliases:[],category:'audio',description:`Apply a local ${name} effect to audio or a video soundtrack.`,usage:`${name} (reply to audio/video)`,ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:5,async run(ctx){
 const source=media.sourceMessage(ctx.msg),info=media.mediaInfo(source);if(!info||!['audio','video'].includes(info.type))return ctx.reply(`⚠️ Reply to or caption audio/video with ${config.prefix}${name}. Maximum 60 seconds and 10 MB.`);
 if(active>=2)return ctx.reply('⏳ Audio effects are busy. Try again shortly.');active++;
 try{await ctx.reply(name==='earrape'?'⏳ Applying a loud effect. Lower your volume before playback.':'⏳ Applying the audio effect locally…');const input=await media.download(ctx.sock,source);if(input.length>10*1024*1024)return ctx.reply('⚠️ Audio must be 10 MB or smaller.');const audio=await media.convert(input,'mp3',['-vn','-af',filter,'-codec:a','libmp3lame','-b:a','128k'],{maxDuration:60});await ctx.sock.sendMessage(ctx.chat,{audio,mimetype:'audio/mpeg',ptt:false},{quoted:ctx.msg});ctx.markReplied();}catch(err){await ctx.reply(err.message.includes('seconds')?'⚠️ Audio must be 60 seconds or shorter.':'⚠️ Could not process this audio. Try a supported clip with a clear audio track.');}finally{active--;}
}}));
