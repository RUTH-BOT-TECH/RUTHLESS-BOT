'use strict';
const media=require('../../lib/media'),config=require('../../config');
let active=0;
module.exports={name:'trim-audio',aliases:['trim','cut-audio'],category:'audio',description:'Trim an audio or video soundtrack to a segment, locally.',usage:'trim <start-seconds> <end-seconds> (reply to audio/video)',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:5,async run(ctx){
 const [a,b]=ctx.args;if(ctx.args.length!==2||!/^\d{1,2}(?:\.\d{1,2})?$/.test(a||'')||!/^\d{1,2}(?:\.\d{1,2})?$/.test(b||''))return ctx.reply(`⚠️ Usage: ${config.prefix}trim 0 10 (reply to audio/video, seconds)`);
 const start=Number(a),end=Number(b);if(start<0||start>=end||end>60)return ctx.reply('⚠️ Choose a start before the end, within 0–60 seconds.');
 const source=media.sourceMessage(ctx.msg),info=media.mediaInfo(source);if(!info||!['audio','video'].includes(info.type))return ctx.reply(`⚠️ Reply to audio or video with ${config.prefix}trim 0 10. Input limit: 60 seconds and 10 MB.`);
 if(active>=2)return ctx.reply('⏳ Audio trimming is busy. Try again shortly.');active++;
 try{const input=await media.download(ctx.sock,source);if(input.length>10*1024*1024)return ctx.reply('⚠️ Input must be 10 MB or smaller.');const audio=await media.convert(input,'mp3',['-ss',String(start),'-t',String(end-start),'-vn','-codec:a','libmp3lame','-b:a','128k'],{maxDuration:60,trimRange:{start,end}});await ctx.sock.sendMessage(ctx.chat,{audio,mimetype:'audio/mpeg',ptt:false},{quoted:ctx.msg});ctx.markReplied();}catch(e){await ctx.reply(e.message.includes('Trim range')?'⚠️ The chosen end must be within the actual clip.':e.message.includes('seconds')?'⚠️ Input must be 60 seconds or shorter.':'⚠️ Could not trim this clip. Try supported audio with a clear soundtrack.');}finally{active--;}
}};
