'use strict';
const config=require('../../config');
const {context,target,inner}=require('../../lib/group');
const {phoneJid,isOwner,normalize,clean}=require('../../lib/owner');
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0};
const command=(name,aliases,description,usage,run)=>({...base,name,aliases,description,usage,run});
async function targetPhone(ctx){
 const raw=await target(ctx);
 if(!raw)return null;
 const pn=await phoneJid(ctx.sock,raw);
 if(!pn||!/^\d{6,15}@s\.whatsapp\.net$/.test(pn))return null;
 return pn;
}
async function protectedTarget(ctx,pn){
 const bot=await phoneJid(ctx.sock,ctx.sock.user?.id);
 return !bot||await isOwner(ctx.sock,pn,null,ctx.db)||normalize(bot)===normalize(pn);
}
function privateOnly(ctx){return !ctx.group && /^\d{6,15}@s\.whatsapp\.net$/.test(ctx.sender||'');}
module.exports=[
 command('setbotname',[],'Change the linked WhatsApp account profile name.','setbotname <name>',async ctx=>{
  if(await ctx.db.get('profileclone:active',null))return ctx.reply(`⚠️ Restore the cloned profile first with ${config.prefix}restoreprofile.`);
  const value=ctx.args.join(' ').trim();if(!value||value.length>60||/[\x00-\x1f\x7f]/.test(value))return ctx.reply(`⚠️ Usage: ${config.prefix}setbotname <name> (1–60 characters).`);
  await ctx.sock.updateProfileName(value);return ctx.reply('✅ WhatsApp profile name updated. This does not change the bot menu title.');
 }),
 command('setbotbio',['setbotstatus'],'Change the linked WhatsApp account About text.','setbotbio <text>',async ctx=>{
  if(await ctx.db.get('profileclone:active',null))return ctx.reply(`⚠️ Restore the cloned profile first with ${config.prefix}restoreprofile.`);
  const value=ctx.args.join(' ').trim();if(!value||value.length>139||/[\x00-\x1f\x7f]/.test(value))return ctx.reply(`⚠️ Usage: ${config.prefix}setbotbio <text> (1–139 characters).`);
  await ctx.sock.updateProfileStatus(value);return ctx.reply('✅ WhatsApp About text updated. This does not post a status story.');
 }),
 command('setbotpp',[],'Set the linked account profile picture from an image.','setbotpp (reply to an image)',async ctx=>{
  if(await ctx.db.get('profileclone:active',null))return ctx.reply(`⚠️ Restore the cloned profile first with ${config.prefix}restoreprofile.`);
  const info=context(ctx.msg),q=info.quotedMessage,im=inner(q).imageMessage;
  if(!q||!im||!info.stanzaId)return ctx.reply(`⚠️ Reply to an image with ${config.prefix}setbotpp.`);
  if(Number(im.fileLength||0)>10*1024*1024)return ctx.reply('⚠️ Profile image must be at most 10 MB.');
  const bot=await phoneJid(ctx.sock,ctx.sock.user?.id);if(!bot)return ctx.reply('⚠️ Linked account identity is unavailable.');
  const media=require('../../lib/media'),data=await media.download(ctx.sock,{key:{remoteJid:ctx.chat,id:info.stanzaId,participant:info.participant},message:q});
  if(data.length>10*1024*1024)return ctx.reply('⚠️ Profile image must be at most 10 MB.');
  let picture;try{picture=await require('sharp')(data,{limitInputPixels:40000000}).rotate().resize(640,640,{fit:'cover'}).jpeg({quality:85}).toBuffer();}catch{return ctx.reply('⚠️ Invalid or unsupported image.');}
  await ctx.sock.updateProfilePicture(bot,picture);return ctx.reply('✅ WhatsApp profile picture updated.');
 }),
 command('delbotpp',[],'Remove the linked account profile picture.','delbotpp confirm',async ctx=>{
  if(await ctx.db.get('profileclone:active',null))return ctx.reply(`⚠️ Restore the cloned profile first with ${config.prefix}restoreprofile.`);
  if(ctx.args.length!==1||ctx.args[0]!=='confirm')return ctx.reply(`⚠️ This removes the WhatsApp profile picture. Use ${config.prefix}delbotpp confirm.`);
  const bot=await phoneJid(ctx.sock,ctx.sock.user?.id);if(!bot)return ctx.reply('⚠️ Linked account identity is unavailable.');
  await ctx.sock.removeProfilePicture(bot);return ctx.reply('✅ WhatsApp profile picture removed.');
 }),
 command('block',[],'Block a phone number on the linked WhatsApp account.','block <number|mention|reply>',async ctx=>{
  const pn=await targetPhone(ctx);if(!pn)return ctx.reply('⚠️ Supply an international phone number, mention, or reply with a resolvable identity.');
  if(await protectedTarget(ctx,pn))return ctx.reply('⛔ The owner and linked account cannot be blocked.');
  await ctx.sock.updateBlockStatus(pn,'block');return ctx.reply('✅ Block request accepted by WhatsApp.');
 }),
 command('unblock',[],'Unblock a phone number on the linked WhatsApp account.','unblock <number|mention|reply>',async ctx=>{
  const pn=await targetPhone(ctx);if(!pn)return ctx.reply('⚠️ Supply an international phone number, mention, or reply with a resolvable identity.');
  await ctx.sock.updateBlockStatus(pn,'unblock');return ctx.reply('✅ Unblock request accepted by WhatsApp.');
 }),
 command('blocklist',[],'Show WhatsApp blocked accounts privately.','blocklist (private chat)',async ctx=>{
  if(!privateOnly(ctx))return ctx.reply('⚠️ Use this command in a private chat with the owner.');
  if(ctx.args.length)return ctx.reply(`⚠️ Usage: ${config.prefix}blocklist`);
  const list=await ctx.sock.fetchBlocklist();if(!Array.isArray(list))throw Error('Invalid blocklist');
  const items=[...new Set(list.filter(x=>typeof x==='string'&&/^\d{6,20}@(s\.whatsapp\.net|lid)$/.test(x)))];
  return ctx.reply(items.length?`🚫 WhatsApp blocklist (${items.length}; first 50):\n${items.slice(0,50).map(x=>`• ${clean(x)}${x.endsWith('@lid')?' (hidden identity)':''}`).join('\n')}`:'🚫 WhatsApp blocklist is empty.');
 }),
 command('join',[],'Join a WhatsApp group using its invite link privately.','join <invite link> (private chat)',async ctx=>{
  if(!privateOnly(ctx))return ctx.reply('⚠️ Send the invite link in your private chat with the bot.');
  let u;try{u=new URL(ctx.args[0]);}catch{}
  if(ctx.args.length!==1||!u||u.protocol!=='https:'||u.hostname!=='chat.whatsapp.com'||u.port||u.username||u.password||u.search||u.hash||!/^\/[A-Za-z0-9]{20,24}\/?$/.test(u.pathname))return ctx.reply(`⚠️ Usage: ${config.prefix}join <WhatsApp group invite link>`);
  try{await ctx.sock.groupAcceptInvite(u.pathname.split('/')[1]);}catch{return ctx.reply('⚠️ Could not join the group. The invite may be invalid or expired.');}return ctx.reply('✅ Group invitation accepted by WhatsApp.');
 }),
 command('leave',[],'Leave the current group after confirmation.','leave confirm (in group)',async ctx=>{
  if(!ctx.group)return ctx.reply('⚠️ Use this command in the group you want the bot to leave.');
  if(ctx.args.length!==1||ctx.args[0]!=='confirm')return ctx.reply(`⚠️ This removes the linked account from this group. Use ${config.prefix}leave confirm.`);
  await ctx.reply('⏳ Requesting to leave this group…');
  try{await ctx.sock.groupLeave(ctx.chat);}catch{return ctx.reply('⚠️ Could not leave the group.');}
  // There may be no ability to send a confirmation after leaving.
 })
,
 command('banuser',[],'Stop a phone number from using bot commands and autodownload.','banuser <number|mention|reply>',async ctx=>{
  const pn=await targetPhone(ctx);if(!pn)return ctx.reply('⚠️ Supply an international phone number, mention, or reply with a resolvable identity.');
  if(await protectedTarget(ctx,pn))return ctx.reply('⛔ The owner and linked account cannot be banned.');
  await ctx.db.set(`ownerban:user:${pn}`,true);return ctx.reply('✅ User banned from bot commands, chatbot, AFK replies and autodownload. Other automations may still run.');
 }),
 command('unbanuser',[],'Restore a phone number’s bot access.','unbanuser <number|mention|reply>',async ctx=>{
  const pn=await targetPhone(ctx);if(!pn)return ctx.reply('⚠️ Supply an international phone number, mention, or reply with a resolvable identity.');
  await ctx.db.del(`ownerban:user:${pn}`);return ctx.reply('✅ User bot-access ban removed.');
 }),
 command('banchat',[],'Disable bot commands in this group for non-owners.','banchat (in group)',async ctx=>{
  if(!ctx.group||ctx.args.length)return ctx.reply(`⚠️ Use ${config.prefix}banchat in the group to restrict.`);
  await ctx.db.set(`ownerban:chat:${ctx.chat}`,true);return ctx.reply('✅ Bot commands, chatbot, AFK replies and autodownload are disabled for non-owners in this group. Other automations may still run.');
 }),
 command('unbanchat',[],'Restore bot commands in this group.','unbanchat (in group)',async ctx=>{
  if(!ctx.group||ctx.args.length)return ctx.reply(`⚠️ Use ${config.prefix}unbanchat in the restricted group.`);
  await ctx.db.del(`ownerban:chat:${ctx.chat}`);return ctx.reply('✅ Bot chat restriction removed.');
 }),
 command('banlist',[],'List bot-access bans privately.','banlist (private chat)',async ctx=>{
  if(!privateOnly(ctx))return ctx.reply('⚠️ Use this command in a private chat with the owner.');
  if(ctx.args.length)return ctx.reply(`⚠️ Usage: ${config.prefix}banlist`);
  const all=await ctx.db.list('ownerban:'),users=[],chats=[];
  for(const [key,value] of all){if(value!==true)continue;const u=key.match(/^ownerban:user:(\d{6,15})@s\.whatsapp\.net$/),g=key.match(/^ownerban:chat:([0-9-]+@g\.us)$/);if(u)users.push(u[1]);if(g)chats.push(g[1]);}
  return ctx.reply(`🚫 Bot access bans\nUsers (${users.length}; first 50): ${users.slice(0,50).join(', ')||'none'}\nGroups (${chats.length}; first 50): ${chats.slice(0,50).join(', ')||'none'}`);
 })
];

// Serialize manual edits with clone and restoration.
for(const c of module.exports)if(['setbotname','setbotbio','setbotpp','delbotpp'].includes(c.name)){const run=c.run;c.run=ctx=>require('../../lib/game-lock').withLock('profileclone:active',()=>run(ctx));}
