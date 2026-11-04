'use strict';
const {context,inner}=require('../../lib/group'),media=require('../../lib/media'),config=require('../../config');
function viewOnce(message){
 let m=message;
 for(let i=0;i<6&&m;i++){
  if(m.viewOnceMessage||m.viewOnceMessageV2||m.viewOnceMessageV2Extension)return true;
  if(m.imageMessage?.viewOnce||m.videoMessage?.viewOnce||m.audioMessage?.viewOnce)return true;
  m=m.ephemeralMessage?.message||m.documentWithCaptionMessage?.message;
 }
 return false;
}
const base={category:'misc',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:5};
function command(name,aliases,toOwner){return {...base,name,aliases,description:toOwner?'Send a replied view-once media to the owner privately; use with consent.':'Reveal replied view-once media in this chat; use with the sender’s consent.',usage:`${name} (reply to a view-once message)`,async run(ctx){
 const c=context(ctx.msg);
 if(!c.quotedMessage||!c.stanzaId||!viewOnce(c.quotedMessage)||(c.remoteJid&&c.remoteJid!==ctx.chat))return ctx.reply(`⚠️ Reply to a view-once image, video or audio using ${config.prefix}${name}. Only save media with the sender’s permission.`);
 if(toOwner&&!/^\d{6,15}$/.test(config.ownerNumber))return ctx.reply('⚠️ The owner number is not configured.');
 const quoted={key:{remoteJid:ctx.chat,id:c.stanzaId,participant:c.participant},message:c.quotedMessage},info=media.mediaInfo(quoted);
 if(!info||!['image','video','audio'].includes(info.type))return ctx.reply('⚠️ This view-once media type is not supported.');
 try{
  const bytes=await media.download(ctx.sock,quoted),caption=ctx.box('🔓 View-once media. Only save or share with the sender’s permission.');
  const payload=info.type==='image'?{image:bytes,caption}:info.type==='video'?{video:bytes,caption}:{audio:bytes,mimetype:info.data.mimetype||'audio/ogg',ptt:!!info.data.ptt};
  await ctx.sock.sendMessage(toOwner?`${config.ownerNumber}@s.whatsapp.net`:ctx.chat,payload,toOwner?{}:{quoted:ctx.msg});
  if(toOwner)await ctx.reply('✅ Sent privately to the bot owner.');else ctx.markReplied();
 }catch{return ctx.reply('⚠️ Could not retrieve this view-once media. It may have expired or WhatsApp did not provide it.');}
}};}
module.exports=[command('viewonce',['unviewonce','readviewonce','vv'],false),command('vv2',[],true)];
module.exports.viewOnce=viewOnce;
