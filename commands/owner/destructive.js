'use strict';
const crypto=require('node:crypto'),config=require('../../config'),chats=require('../../lib/observed-chats');
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0,aliases:[]},drafts=new Map();let active=false;
const privateChat=ctx=>!ctx.group&&ctx.chat===ctx.sender&&/^\d{6,15}@s\.whatsapp\.net$/.test(ctx.sender);
module.exports=[
 {...base,name:'clearsession',description:'Delete the remote pairing record, including its session and backup.',usage:'clearsession erase-remote-session-and-backup',async run(ctx){
  if(!privateChat(ctx))return ctx.reply('⚠️ Use this command in a verified owner private chat.');
  if(await ctx.db.get('profileclone:active',null))return ctx.reply(`⚠️ Restore the profile first using ${config.prefix}restoreprofile.`);
  if(ctx.args.length!==1||ctx.args[0]!=='erase-remote-session-and-backup')return ctx.reply(`⚠️ PERMANENT: this deletes the remote pairing session, settings backup, and support record and stops the bot. A new pairing will be required. Local files remain; linked devices are not automatically logged out. Use ${config.prefix}clearsession erase-remote-session-and-backup only if you intend this.`);
  if(!ctx.db.pairingClient||typeof ctx.db.stopAfterDelete!=='function')return ctx.reply('⚠️ This bot has no supported pairing-service session deletion. No data was removed.');
  try{await ctx.db.pairingClient.deleteData();}catch{return ctx.reply('⚠️ Remote deletion was not confirmed; no stop was requested. Check the pairing service before retrying.');}
  try{await ctx.reply('✅ Remote pairing session and settings backup deleted. This bot is stopping. Local files remain; pair again to use a new session.');}finally{ctx.db.stopAfterDelete();}
 }},
 {...base,name:'clearchat-all',description:'Request WhatsApp clear on chats observed in this bot process.',usage:'clearchat-all | clearchat-all confirm <code>',async run(ctx){
  if(!privateChat(ctx))return ctx.reply('⚠️ Use this command in a verified owner private chat.');
  const now=Date.now();for(const [key,d] of drafts)if(d.expires<=now)drafts.delete(key);
  if(ctx.args[0]==='confirm'){
   const d=drafts.get(ctx.sender);if(ctx.args.length!==2||!d||d.code!==ctx.args[1]||d.expires<=now)return ctx.reply('⚠️ Confirmation invalid or expired. Prepare the clear operation again.');
   if(active)return ctx.reply('⚠️ Another clear operation is in progress.');
   drafts.delete(ctx.sender);active=true;
   try{let ok=0,fail=0;await ctx.reply(`⏳ Requesting WhatsApp to clear ${d.items.length} observed chat(s). This may be irreversible.`);
    for(const item of d.items){try{await ctx.sock.chatModify({clear:true,lastMessages:[item.msg]},item.jid);ok++;chats.forget(item.jid,item.msg.key.id);}catch{fail++;}}
    return ctx.reply(`🧹 WhatsApp accepted ${ok} clear request(s); ${fail} failed. This covered only chats seen in this bot process, not every account chat. Verify results on your linked account.`);
   }finally{active=false;}
  }
  if(ctx.args.length)return ctx.reply(`⚠️ Usage: ${config.prefix}clearchat-all`);
  const candidates=chats.snapshot(ctx.chat),items=[];
  for(const item of candidates){if(!item.jid.endsWith('@g.us')&&await require('../../lib/owner').isOwner(ctx.sock,item.jid,null,ctx.db))continue;items.push(item);}
  if(!items.length)return ctx.reply('ℹ️ No eligible incoming chats have been observed since this process started. Nothing was cleared.');
  if(items.length>50)return ctx.reply('⚠️ More than 50 chats were observed; this command will not clear them in one batch. Nothing was cleared.');
  if(!drafts.has(ctx.sender)&&drafts.size>=5)return ctx.reply('⚠️ Too many pending clear operations.');
  const code=crypto.randomBytes(6).toString('hex');drafts.set(ctx.sender,{items,code,expires:now+120000});
  return ctx.reply(`⚠️ DESTRUCTIVE: request WhatsApp to clear ${items.length} chat(s) seen since this bot started, through their last observed incoming message. This is NOT all chats on the account, may remove message history and may be irreversible. Your current owner chat is excluded. Nothing has been cleared yet.\nConfirm within 2 minutes: ${config.prefix}clearchat-all confirm ${code}`);
 }}
];

for(const c of module.exports)if(c.name==='clearsession'){const run=c.run;c.run=ctx=>require('../../lib/game-lock').withLock('profileclone:active',()=>run(ctx));}
