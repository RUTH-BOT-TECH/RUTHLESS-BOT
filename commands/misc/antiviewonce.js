'use strict';
const config=require('../../config');
const auto=require('../../lib/auto-viewonce');
const {groupContext}=require('../../lib/group');
module.exports={name:'antiviewonce',aliases:[],category:'misc',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:0,
 description:'Per-chat opt-in: copy new view-once media privately to the owner; use only with sender permission.',
 usage:'antiviewonce on|off|status',
 async run(ctx){
  if(!auto.validChat(ctx.chat))return ctx.reply('⚠️ This chat type is not supported.');
  const [op='status']=ctx.args;
  if(ctx.args.length>1||!['on','off','status'].includes(op))return ctx.reply(`⚠️ Use ${config.prefix}antiviewonce on, off, or status.`);
  if(op==='on'&&!ctx.owner)return ctx.reply('⛔ Only the bot owner can enable view-once copying.');
  // A group admin/moderator can always stop collection for their group.
  if(ctx.group&&!ctx.owner&&!await groupContext(ctx))return;
  if(op==='on'&&!/^\d{6,15}$/.test(config.ownerNumber))return ctx.reply('⚠️ Configure a valid OWNER_NUMBER before enabling this feature.');
  await auto.lock(ctx.db,ctx.chat,async()=>{
   const enabled=await ctx.db.get(auto.key(ctx.chat),false)===true;
   if(op==='status')return ctx.reply(`👁️ Automatic private view-once copying is ${enabled?'ON':'OFF'} in this chat. It only applies to new media and requires the sender’s permission.`);
   if(op==='on'){
    if(enabled)return ctx.reply('ℹ️ Automatic private view-once copying is already on in this chat.');
    await ctx.reply(`📣 Enabling view-once copying in this chat. New view-once images, videos and audio may be copied as ordinary media and sent privately to the bot owner. Enable only with everyone’s permission. Ask the bot owner to use ${config.prefix}antiviewonce off to stop it; permitted group admins can also disable it.`);
    await ctx.db.set(auto.key(ctx.chat),true);
   }else{
    await ctx.db.set(auto.key(ctx.chat),false);
    return ctx.reply('🛑 Automatic private view-once copying is off in this chat. Already sent copies cannot be recalled.');
   }
  });
 }};
