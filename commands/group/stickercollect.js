'use strict';
const config=require('../../config');
const collector=require('../../lib/sticker-collector');
module.exports={
 name:'stickercollect',aliases:[],category:'group',ownerOnly:false,adminOnly:true,groupOnly:true,cooldown:0,
 description:'Opt in this group to collection of newly posted stickers.',
 usage:'stickercollect <on|off|status>',
 async run(ctx){
  const [op='status']=ctx.args;
  if(ctx.args.length>1||!['on','off','status'].includes(op))return ctx.reply(`⚠️ Use ${config.prefix}stickercollect on, off, or status.`);
  if(op==='status'){
   const s=await collector.status(ctx.db,ctx.chat);
   return ctx.reply(`🧩 Sticker collection is ${s.enabled?'ON':'OFF'} in this group. ${s.groupPending} pending from this group. Enabled groups share a batch of 10 sent as individual stickers to the bot account’s own chat. Local pending stickers expire after 7 days; restarts on temporary hosts may erase them.`);
  }
  if(op==='on'){
   if(!ctx.owner)return ctx.reply('⛔ Only the bot owner can enable sticker collection.');
   // Announce before enabling: if a group notice cannot be delivered, do not collect.
   const enabled=await collector.enableGroup(ctx.db,ctx.chat,()=>ctx.reply(`📣 Sticker collection is being enabled for this group. New stickers here may be temporarily stored on the bot host and sent privately to the linked bot account, in batches of 10 with Ruth labels. Not a native pack; others may still copy them. Use ${config.prefix}stickercollect off to stop and remove this group’s pending stickers. Please enable only with members’ permission.`));
   if(!enabled)return ctx.reply('ℹ️ Sticker collection is already on in this group.');return;
  }
  await collector.stopGroup(ctx.db,ctx.chat);
  return ctx.reply('🛑 Sticker collection is off for this group. Its pending stickers were removed from the local queue; copies already sent cannot be recalled.');
 }
};
