'use strict';
const crypto=require('node:crypto'),config=require('../config'),{normalize}=require('./owner');
const MAX=50,PREVIEW=120000,INTERVAL=10000,ID=/^\d{6,15}@s\.whatsapp\.net$/;
function validPrivate(ctx){return ctx.owner&&!ctx.group&&ID.test(normalize(ctx.sender)||'')&&normalize(ctx.sender)===normalize(ctx.chat);}
function parse(args){
 if(!Array.isArray(args)||!args.length||args.join(' ').length>5000)throw Error('INVALID');
 const codes=[];for(const raw of args){let u;try{u=new URL(raw);}catch{throw Error('INVALID');}
  if(u.protocol!=='https:'||u.hostname.toLowerCase()!=='chat.whatsapp.com'||u.username||u.password||u.port||u.hash)throw Error('INVALID');
  const m=u.pathname.match(/^\/(?:invite\/)?([A-Za-z0-9]{20,24})\/?$/);if(!m)throw Error('INVALID');
  if(!codes.includes(m[1]))codes.push(m[1]);if(codes.length>MAX)throw Error('LIMIT');
 }return codes;
}
function create({wait=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}={}){
 const drafts=new Map();let active=null;
 const prune=()=>{for(const [k,v] of drafts)if(v.expires<=now())drafts.delete(k);};
 const command={name:'joinall',aliases:['joinbulk'],category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0,
  description:'Privately preview and join pasted WhatsApp group invites, one at a time.',usage:'joinall <links> | joinall confirm <code> | joinall cancel',async run(ctx){
   if(!validPrivate(ctx))return ctx.reply('⚠️ Use this in your verified owner private chat only.');prune();
   if(ctx.args[0]==='cancel'){
    if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}joinall cancel`);
    const had=drafts.delete(ctx.sender);if(active){active.cancelled=true;return ctx.reply('🛑 Stopping after the current join request, if any.');}
    return ctx.reply(had?'✅ Pending join preview cancelled.':'ℹ️ No join batch is active or awaiting confirmation.');
   }
   if(ctx.args[0]==='confirm'){
    const draft=drafts.get(ctx.sender);if(ctx.args.length!==2||!draft||draft.token!==ctx.args[1]||draft.expires<=now())return ctx.reply('⚠️ Preview expired or code did not match. Paste the links again.');
    if(active)return ctx.reply('⚠️ Another group-join batch is running.');
    drafts.delete(ctx.sender);const job=active={cancelled:false};let attempted=0,accepted=0,uncertain=0,reason='';
    try{
     await ctx.reply(`⏳ Joining up to ${draft.codes.length} groups, one at a time, with at least 10 seconds between requests. Use ${config.prefix}joinall cancel to stop.`);
     for(let i=0;i<draft.codes.length;i++){
      if(job.cancelled){reason='cancelled';break;}if(i>0){await wait(INTERVAL);if(job.cancelled){reason='cancelled';break;}}
      if(ctx.sock.ws&&ctx.sock.ws.isOpen===false){reason='offline';break;}
      attempted++;
      try{const result=await ctx.sock.groupAcceptInvite(draft.codes[i]);if(typeof result!=='string'||!/^\d+(?:-\d+)?@g\.us$/.test(result)){uncertain++;reason='unconfirmed';break;}accepted++;}
      catch{uncertain++;reason='unconfirmed';break;}
     }
     const remaining=draft.codes.length-attempted;
     return ctx.reply(`📋 Group joins: ${accepted} accepted, ${uncertain} unconfirmed, ${remaining} not attempted.${reason==='cancelled'?' Batch cancelled.':reason==='offline'?' Connection lost; the batch will not resume automatically.':reason==='unconfirmed'?' Stopped on an error or unconfirmed result; it could be invalid, pending approval, a restriction or a connection issue. Check WhatsApp before retrying.':''} Acceptance does not guarantee membership.`);
    }finally{if(active===job)active=null;}
   }
   if(active)return ctx.reply('⚠️ A group-join batch is already running.');
   let codes;try{codes=parse(ctx.args);}catch(e){return ctx.reply(e.message==='LIMIT'?`⚠️ Maximum ${MAX} unique links per batch; no join requests sent.`:`⚠️ Paste WhatsApp group invite links after ${config.prefix}joinall. Nothing was joined.`);}
   if(!drafts.has(ctx.sender)&&drafts.size>=5)return ctx.reply('⚠️ Too many pending join previews. Try again later.');
   const token=crypto.randomBytes(6).toString('hex');drafts.set(ctx.sender,{codes,token,expires:now()+PREVIEW});
   return ctx.reply(`📋 Join preview: ${codes.length} unique group link(s). No requests sent yet.\nConfirm within 2 minutes: ${config.prefix}joinall confirm ${token}\nCancel: ${config.prefix}joinall cancel\nA 10-second gap is not a guarantee against WhatsApp restrictions.`);
 }};return {command};
}
module.exports={create,parse,validPrivate,MAX,INTERVAL};
