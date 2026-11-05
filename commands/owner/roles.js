'use strict';
const config=require('../../config');
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0,aliases:[]};
const descriptions={owner:'full owner access',sudo:'full owner access',mod:'bot group-admin command access',prem:'command cooldown bypass'};
const labels={owner:'owner',sudo:'sudo',mod:'moderator',prem:'premium member'};
const result=[];
for(const role of ['owner','sudo','mod','prem']){
 for(const action of ['add','del']){
  const name=action+role;
  result.push({...base,name,description:`${action==='add'?'Grant':'Remove'} ${descriptions[role]}.`,usage:`${name} <international number> confirm (private chat)`,async run(ctx){
   if(ctx.group)return ctx.reply('⚠️ Manage roles in a private owner chat.');
   if(ctx.args.length!==2||!/^\+?\d{6,15}$/.test(ctx.args[0])||ctx.args[1]!=='confirm')return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <international number> confirm\n${role==='owner'||role==='sudo'?'Warning: this grants full owner access, including sensitive and host controls.':`Role: ${descriptions[role]}.`}`);
   const digits=ctx.args[0].replace(/^\+/,''),pn=`${digits}@s.whatsapp.net`;
   if(digits===config.ownerNumber)return ctx.reply('⚠️ The configured primary owner is managed through OWNER_NUMBER, not roles.');
   if(action==='add')await ctx.db.set(`roles:${role}:${pn}`,true);else await ctx.db.del(`roles:${role}:${pn}`);
   return ctx.reply(`✅ ${labels[role]} ${action==='add'?'added':'removed'}: ${digits}. ${action==='add'?`Access: ${descriptions[role]}.`:''}`);
  }});
 }
 result.push({...base,name:'list'+role,description:`List ${labels[role]}s privately.`,usage:`list${role} (private chat)`,async run(ctx){
  if(ctx.group)return ctx.reply('⚠️ View role lists in a private owner chat.');
  if(ctx.args.length)return ctx.reply(`⚠️ Usage: ${config.prefix}list${role}`);
  const list=(await ctx.db.list(`roles:${role}:`)).filter(([key,value])=>value===true&&new RegExp(`^roles:${role}:\\d{6,15}@s\\.whatsapp\\.net$`).test(key)).map(([key])=>key.slice(`roles:${role}:`.length).split('@')[0]).sort();
  return ctx.reply(`👥 ${labels[role]}s (${list.length}; first 50):\n${list.slice(0,50).map(n=>`• ${n}`).join('\n')||'None.'}${role==='owner'?`\nThe configured primary owner is managed separately.`:''}`);
 }});
}
module.exports=result;
