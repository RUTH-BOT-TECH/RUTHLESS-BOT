'use strict';
const crypto=require('node:crypto');
const config=require('../../config');
const {groupContext}=require('../../lib/group');
const media=require('../../lib/media');
const drafts=new Map();let active=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const validRecipient=id=>/^\d{6,15}@s\.whatsapp\.net$/.test(id)||/^[0-9-]+@g\.us$/.test(id);
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0};
function prune(){const now=Date.now();for(const [id,d] of drafts)if(d.expires<=now)drafts.delete(id);}
async function recipients(db,scope){const rows=await db.list('broadcast:optin:');return [...new Set(rows.filter(([k,v])=>v===true&&k.startsWith('broadcast:optin:')).map(([k])=>k.slice(16)).filter(id=>validRecipient(id)&&(scope==='all'||(scope==='group'?id.endsWith('@g.us'):id.endsWith('@s.whatsapp.net')))))].sort();}
async function payload(ctx,kind){
 if(kind==='text'){const text=ctx.args.join(' ').trim();if(!text||text.length>3000)throw Error('Provide text of up to 3000 characters.');return {text};}
 if(kind==='poll'){const parts=ctx.args.join(' ').split('|').map(s=>s.trim()).filter(Boolean);if(parts.length<3||parts.length>13||parts.some(s=>s.length>200))throw Error('Use question | option 1 | option 2 (up to 12 options).');return {poll:{name:parts[0],values:parts.slice(1),selectableCount:1}};}
 const source=media.sourceMessage(ctx.msg),info=media.mediaInfo(source);if(!info||info.type!==kind)throw Error(`Reply to or caption a ${kind}.`);
 if(Number(info.data.fileLength||0)>10*1024*1024)throw Error('Broadcast media must be at most 10 MB.');
 let data;try{data=await media.download(ctx.sock,source);}catch{throw Error('Could not download the broadcast media.');}if(data.length>10*1024*1024)throw Error('Broadcast media must be at most 10 MB.');
 const caption=ctx.args.join(' ').trim();if(caption.length>1000)throw Error('Caption must be at most 1000 characters.');
 if(kind==='audio')return {audio:data,mimetype:info.data.mimetype||'audio/mpeg',ptt:!!info.data.ptt};
 return {[kind]:data,...(caption?{caption}:{}),...(info.data.mimetype?{mimetype:info.data.mimetype}:{})};
}
const optin={name:'broadcastopt',aliases:[],category:'general',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:0,description:'Opt this chat into or out of broadcasts.',usage:'broadcastopt in|out',async run(ctx){
 if(ctx.args.length!==1||!['in','out'].includes(ctx.args[0]))return ctx.reply(`⚠️ Usage: ${config.prefix}broadcastopt in|out`);
 if(ctx.group&&!await groupContext(ctx))return;
 const id=ctx.group?ctx.chat:ctx.sender;
 if(!validRecipient(id))return ctx.reply('⚠️ Your phone identity could not be verified for broadcast consent.');
 if(ctx.args[0]==='in')await ctx.db.set(`broadcast:optin:${id}`,true);else await ctx.db.del(`broadcast:optin:${id}`);
 return ctx.reply(ctx.args[0]==='in'?'✅ This chat opted in to owner broadcasts. Use .broadcastopt out to stop.':'✅ This chat opted out of owner broadcasts.');
}};
async function run(ctx,kind,scope){
 if(ctx.group)return ctx.reply('⚠️ Prepare broadcasts in a private owner chat.');
 prune();
 if(ctx.args[0]==='confirm'){
  if(ctx.args.length!==2)return ctx.reply(`⚠️ Usage: ${config.prefix}${ctx.invoked} confirm <preview code>`);
  const d=drafts.get(ctx.sender);if(!d||d.token!==ctx.args[1]||d.name!==ctx.invoked||d.expires<=Date.now())return ctx.reply('⚠️ Preview expired or code did not match. Prepare the broadcast again.');
  if(active)return ctx.reply('⚠️ Another broadcast is running; try again before the preview expires.');
  drafts.delete(ctx.sender);active=true;
  try{
   let sent=0,failed=0,skipped=0;
   for(const id of d.ids){
    if(!await ctx.db.get(`broadcast:optin:${id}`,false)){skipped++;continue;}
    try{await ctx.sock.sendMessage(id,d.content);sent++;}catch{failed++;}
    if(sent+failed<d.ids.length)await delay(1500);
   }
   return ctx.reply(`📣 Broadcast finished: ${sent} sent, ${failed} failed, ${skipped} opted out. A successful send is not proof of delivery or reading.`);
  }finally{active=false;}
 }
 let content;try{content=await payload(ctx,kind);}catch(e){return ctx.reply(`⚠️ ${e.message}`);}
 let ids=await recipients(ctx.db,scope);
 if(ids.some(id=>id.endsWith('@g.us'))){let groups;try{groups=await ctx.sock.groupFetchAllParticipating();}catch{return ctx.reply('⚠️ Could not verify joined groups; no broadcast was prepared.');}ids=ids.filter(id=>!id.endsWith('@g.us')||Object.hasOwn(groups,id));}
 if(!ids.length)return ctx.reply(`⚠️ No eligible opted-in chats. Recipients can use ${config.prefix}broadcastopt in.`);
 if(ids.length>50)return ctx.reply('⚠️ More than 50 chats opted in. Reduce the audience before broadcasting; nothing was sent.');
 if(!drafts.has(ctx.sender)&&drafts.size>=5)return ctx.reply('⚠️ Too many pending broadcasts. Try again after a preview expires.');
 const token=crypto.randomBytes(6).toString('hex');drafts.set(ctx.sender,{name:ctx.invoked,token,ids,content,expires:Date.now()+120000});
 return ctx.reply(`📣 Broadcast preview: ${kind}, ${ids.length} opted-in chats (${ids.filter(x=>x.endsWith('@g.us')).length} groups). Nothing sent yet.\nConfirm within 2 minutes: ${config.prefix}${ctx.invoked} confirm ${token}`);
}
const defs=[['broadcast',['bc'],'text','all'],['bcgroup',[],'text','group'],['bcpm',[],'text','private'],['bcimage',[],'image','all'],['bcvideo',[],'video','all'],['bcaudio',[],'audio','all'],['bcpoll',[],'poll','all']];
module.exports=[optin,...defs.map(([name,aliases,kind,scope])=>({...base,name,aliases,description:`Prepare an opt-in ${kind} broadcast with confirmation.`,usage:`${name} <content> | ${name} confirm <preview code>`,run:ctx=>run(ctx,kind,scope)}))];
