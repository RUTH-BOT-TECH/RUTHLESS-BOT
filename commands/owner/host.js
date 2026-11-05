'use strict';
const crypto=require('node:crypto'),config=require('../../config'),host=require('../../lib/host-commands');
const drafts=new Map();let active=false;
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0};
async function run(ctx,kind){
 if(process.env.HOST_COMMANDS==='off')return ctx.reply('⚠️ Host commands are disabled by HOST_COMMANDS.');
 if(ctx.group||ctx.chat!==ctx.sender||!/^\d{6,15}@s\.whatsapp\.net$/.test(ctx.sender))return ctx.reply('⚠️ Host commands require a verified owner private chat.');
 const now=Date.now();for(const [id,d] of drafts)if(d.expires<=now)drafts.delete(id);
 if(ctx.args[0]==='confirm'){
  const d=drafts.get(ctx.sender);if(ctx.args.length!==2||!d||d.kind!==kind||d.alias!==ctx.invoked||d.token!==ctx.args[1]||d.expires<=now)return ctx.reply('⚠️ Confirmation expired or does not match. Prepare the command again.');
  if(active)return ctx.reply('⚠️ Another host command is running. Try again before this confirmation expires.');
  drafts.delete(ctx.sender);active=true;
  try{
   await ctx.reply('⏳ Running on the bot host. Output may contain secrets.');
   let result;try{result=await host.execute(kind,d.input);}catch{return ctx.reply('⚠️ Could not start the host command.');}
   const output=result.output.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
   return ctx.reply(`🖥️ Host result\n${result.timedOut?'Timed out':`Exit: ${result.code===null?'terminated':result.code}`}${result.truncated?' (output truncated)':''}\n${output||'(no output)'}`);
  }finally{active=false;}
 }
 try{host.spec(kind,ctx.args);}catch{return ctx.reply(`⚠️ Usage: ${config.prefix}${ctx.invoked} <command or path(s)>`);}
 if(ctx.args.join(' ').length>4000)return ctx.reply('⚠️ Input exceeds 4000 characters.');
 if(!drafts.has(ctx.sender)&&drafts.size>=5)return ctx.reply('⚠️ Too many pending host actions.');
 const token=crypto.randomBytes(6).toString('hex');drafts.set(ctx.sender,{kind,alias:ctx.invoked,input:ctx.args.slice(),token,expires:now+120000});
 return ctx.reply(`⚠️ HOST ACCESS: this can read secrets, change files or control the server. Not sandboxed. Nothing has run yet.\nConfirm within 2 minutes: ${config.prefix}${ctx.invoked} confirm ${token}`);
}
const defs=[['shell',['exec','terminal'],'shell'],['eval',[],'eval'],['ls',[],'ls'],['cat',[],'cat'],['rm',[],'rm'],['mv',[],'mv'],['cp',[],'cp']];
module.exports=defs.map(([name,aliases,kind])=>({...base,name,aliases,description:'Run a host command after private confirmation; not sandboxed.',usage:`${name} <command or path(s)>`,run:ctx=>run(ctx,kind)}));
