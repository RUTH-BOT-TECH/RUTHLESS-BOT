'use strict';
const crypto=require('node:crypto'),sharp=require('sharp'),config=require('../../config');
const {groupContext,context}=require('../../lib/group'),{normalize}=require('../../lib/owner');
const {viewOnce}=require('../misc/viewonce'),media=require('../../lib/media'),status=require('../../lib/group-status');
const MAX=16*1024*1024, MAX_GROUPS=50, PREFIX='groupstatus:optin:';
const drafts=new Map();let active=false, preparing=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function prune(){const now=Date.now();for(const [owner,d] of drafts)if(d.expires<=now)drafts.delete(owner);}
async function eligible(db,sock){
 const rows=await db.list(PREFIX),groups=await sock.groupFetchAllParticipating();
 if(!groups || typeof groups!=='object' || Array.isArray(groups))throw Error('Cannot verify memberships');
 return [...new Set(rows.filter(([k,v])=>v===true&&k.startsWith(PREFIX)).map(([k])=>k.slice(PREFIX.length)).filter(id=>status.validGroup(id)&&Object.hasOwn(groups,id)))].sort();
}
const opt={name:'gstatusopt',aliases:['gpostopt'],category:'group',ownerOnly:false,adminOnly:false,groupOnly:true,cooldown:0,description:'A group admin can opt this group in or out of owner multi-group status posts.',usage:'gstatusopt in|out',async run(ctx){
 if(!ctx.group||!status.validGroup(ctx.chat))return ctx.reply('⚠️ Use this command inside a group.');
 if(ctx.args.length!==1||!['in','out'].includes(ctx.args[0]))return ctx.reply(`⚠️ Usage: ${config.prefix}gstatusopt in|out`);
 let group;try{group=await groupContext(ctx);}catch{return ctx.reply('⚠️ Could not verify group membership and admin rights.');}
 if(!group)return;
 // A bot owner or delegated moderator is not necessarily a WhatsApp group admin.
 if(!group.sender?.admin)return ctx.reply('⛔ A WhatsApp group admin must opt this group in or out.');
 if(!group.bot)return ctx.reply('⚠️ Could not verify the bot is a member of this group.');
 if(ctx.args[0]==='in')await ctx.db.set(PREFIX+ctx.chat,true);else await ctx.db.del(PREFIX+ctx.chat);
 return ctx.reply(ctx.args[0]==='in'?`✅ This group opted in to owner multi-group status posts. An admin can stop them with ${config.prefix}gstatusopt out.`:'✅ This group opted out of owner multi-group status posts.');
}};
async function prepareMedia(ctx,source,info){
 if(Number(info.data.fileLength||0)>MAX)throw Error('size limit');
 const input=await media.download(ctx.sock,source,{maxBytes:MAX});let data;
 if(info.type==='image')data=await sharp(input,{limitInputPixels:40000000}).rotate().resize(1920,1920,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
 else data=await media.convert(input,'mp4',['-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-vf','scale=trunc(min(1280\\,iw)/2)*2:-2','-c:a','aac','-b:a','128k','-pix_fmt','yuv420p','-movflags','+faststart'],{maxDuration:30});
 if(!data.length||data.length>MAX)throw Error('size limit');return data;
}
const bulk={name:'gpostall',aliases:['gstatusall'],category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0,description:'Privately prepare an experimental group status for opted-in groups; confirmation required.',usage:'gpostall <text> or reply to photo/video; gpostall confirm <code>',async run(ctx){
 // Require both handler-verified owner and the owner's own private conversation.
 if(!ctx.owner||ctx.group||normalize(ctx.chat)!==normalize(ctx.sender)||!/^\d{6,15}@s\.whatsapp\.net$/.test(normalize(ctx.sender)||''))return ctx.reply('⚠️ Use this in your verified owner private chat only.');
 prune();
 if(ctx.args[0]==='confirm'){
  const d=drafts.get(ctx.sender);if(ctx.args.length!==2||!d||d.token!==ctx.args[1]||d.expires<=Date.now())return ctx.reply('⚠️ Preview expired or code did not match. Prepare the status again.');
  if(active)return ctx.reply('⏳ Another multi-group status is running. Try again before the preview expires.');
  let joined;try{joined=await ctx.sock.groupFetchAllParticipating();if(!joined||typeof joined!=='object'||Array.isArray(joined))throw Error();}catch{return ctx.reply('⚠️ Could not recheck group membership; nothing was sent.');}
  drafts.delete(ctx.sender);active=true;
  try{
   let submitted=0,uncertain=0,skipped=0;
   await ctx.reply(`⏳ Sending the status to up to ${d.ids.length} opted-in groups. No ordinary group messages will be sent.`);
   for(const [index,id] of d.ids.entries()){
    if(!Object.hasOwn(joined,id)||await ctx.db.get(PREFIX+id,false)!==true){skipped++;continue;}
    try{if(d.type==='text')await status.send(ctx.sock,id,d.text);else await status.sendMedia(ctx.sock,id,d.type,d.data,d.text);submitted++;}catch{uncertain++;}
    if(index<d.ids.length-1)await delay(1500);
   }
   return ctx.reply(`📤 Group Status requests: ${submitted} submitted, ${uncertain} uncertain, ${skipped} skipped (left or opted out). Submission is not proof of delivery or audience. Check affected groups before retrying; uncertain requests may still appear. No personal-status or ordinary-group-message fallback was used.`);
  }finally{active=false;}
 }
 if(ctx.args[0]==='cancel'){if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}gpostall cancel`);drafts.delete(ctx.sender);return ctx.reply('✅ Pending multi-group status cancelled.');}
 const text=ctx.args.join(' ').trim();if(Array.from(text).length>700)return ctx.reply('⚠️ Text or caption must be no more than 700 characters.');
 const quote=context(ctx.msg);if(quote.remoteJid&&normalize(quote.remoteJid)!==normalize(ctx.chat))return ctx.reply('⚠️ Only media from this private chat can be posted.');
 const source=media.sourceMessage(ctx.msg),info=media.mediaInfo(source);
 if(source&&viewOnce(source.message))return ctx.reply('⚠️ View-once media cannot be posted.');
 if(info&&!['image','video'].includes(info.type))return ctx.reply('⚠️ Use text, or reply to a normal photo or video.');
 if(!info&&!text)return ctx.reply(`⚠️ Use ${config.prefix}gpostall <text>, or reply to a photo/video with ${config.prefix}gpostall [caption].`);
 let ids;try{ids=await eligible(ctx.db,ctx.sock);}catch{return ctx.reply('⚠️ Could not verify joined groups; nothing was prepared.');}
 if(!ids.length)return ctx.reply(`⚠️ No joined groups have opted in. A group admin can use ${config.prefix}gstatusopt in inside each group.`);
 if(ids.length>MAX_GROUPS)return ctx.reply(`⚠️ More than ${MAX_GROUPS} groups opted in. Reduce the audience first; nothing was sent.`);
 if(!drafts.has(ctx.sender)&&drafts.size+preparing>=2)return ctx.reply('⚠️ Too many pending or preparing previews. Try again shortly.');
 if(preparing>=2)return ctx.reply('⏳ Media preparation is busy. Try again shortly.');
 let data;if(info){preparing++;try{await ctx.reply('⏳ Preparing your media locally…');data=await prepareMedia(ctx,source,info);}catch(err){return ctx.reply(err.message.includes('30 seconds')?'⚠️ Video must be 30 seconds or shorter. Nothing was sent.':err.message.includes('size limit')?'⚠️ Media exceeds the 16 MB limit. Nothing was sent.':'⚠️ Could not prepare this media. Nothing was sent.');}finally{preparing--;}}
 // Replacing one owner's earlier preview never sends it.
 const token=crypto.randomBytes(6).toString('hex');drafts.set(ctx.sender,{token,ids,type:info?.type||'text',text,data,expires:Date.now()+120000});
 return ctx.reply(`📋 Group Status preview: ${info?.type||'text'}, ${ids.length} opted-in joined groups. Nothing sent yet.\nConfirm within 2 minutes: ${config.prefix}gpostall confirm ${token}\nCancel: ${config.prefix}gpostall cancel`);
}};
module.exports=[opt,bulk];
