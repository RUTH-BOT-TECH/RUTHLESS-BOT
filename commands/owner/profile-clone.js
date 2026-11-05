'use strict';
const config=require('../../config'),profile=require('../../lib/profile-clone');
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0};
module.exports=[
 {...base,name:'clone',aliases:['cloneprofile'],description:'Temporarily copy a visible WhatsApp profile for 24 hours.',usage:'clone (reply or mention in a group)',async run(ctx){
  if(!ctx.owner||!ctx.group)return ctx.reply('⚠️ Use this owner command by replying to someone or mentioning them in a group.');
  const jid=await profile.selected(ctx);if(!jid)return ctx.reply(`⚠️ Reply to a message or mention someone with ${config.prefix}clone.`);
  try{const result=await profile.clone(ctx.sock,ctx.db,ctx.chat,jid);return ctx.reply(`✅ Profile change submitted for 24 hours.${result.bio?' About copied too.':' About was unavailable, so it was not changed.'}\nThe account number stays the same. Restore early: ${config.prefix}restoreprofile`);}
  catch(err){const m={NAME_UNAVAILABLE:'⚠️ WhatsApp did not provide their profile name. Ask them to send a new message, then reply to it.',ORIGINAL_NAME_UNAVAILABLE:'⚠️ The bot’s original profile name is unavailable, so nothing was changed.',PHOTO_UNAVAILABLE:'⚠️ The original or target profile picture is unavailable. Nothing was changed.',BACKUP_UNAVAILABLE:'⚠️ Could not safely back up the original profile. Nothing was changed.',RESTORE_PENDING:`⚠️ A profile update failed and restoration is pending. Use ${config.prefix}restoreprofile; the bot will retry.`,UPDATE_FAILED_RESTORED:'⚠️ The profile update failed; original profile restore was submitted.'};return ctx.reply(m[err.message]||'⚠️ Another clone may be active, or durable profile storage is unavailable. Restore first.');}
 }},
 {...base,name:'restoreprofile',aliases:['unclone'],description:'Restore the profile saved before cloning.',usage:'restoreprofile',async run(ctx){if(!ctx.owner)return;try{const result=await profile.restore(ctx.sock,ctx.db);return ctx.reply(result==='none'?'ℹ️ No cloned profile is waiting to be restored.':'✅ Original profile restoration submitted.');}catch{return ctx.reply('⚠️ Could not fully restore the profile yet. The backup is retained; try again.');}}}
];
