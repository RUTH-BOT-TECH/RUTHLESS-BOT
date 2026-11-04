'use strict';
const crypto=require('node:crypto'),config=require('../../config'),{withLock}=require('../../lib/game-lock'),reminders=require('../../lib/reminders');
const base={category:'misc',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:1};
const cmd=(name,aliases,description,usage,run)=>({...base,name,aliases,description,usage,run});
const line=(ctx,text)=>ctx.reply(`⚠️ Usage: ${config.prefix}${text}`);
const list=(title,items)=>`${title}\n${items.length?items.map((v,i)=>`${i+1}. ${typeof v==='string'?v:(v.done?'✅ ':'')+v.text}`).join('\n'):'Nothing saved yet.'}`;
function saved(kind){return cmd(kind,kind==='note'?['notes','addnote']:['addtodo','list-todo'],`Add or list your personal ${kind} entries.`,`${kind} [text]`,async ctx=>{
 const key=`${kind}:${ctx.sender}`,text=ctx.args.join(' ').trim();
 if(text.length>500)return ctx.reply('⚠️ Text must be 500 characters or fewer.');
 return withLock(key,async()=>{const entries=await ctx.db.get(key,[]);if(!Array.isArray(entries))return ctx.reply('⚠️ Saved data is invalid; nothing was changed.');
  if(!text)return ctx.reply(list(kind==='note'?'📝 Your notes':'📋 Your todos',entries));
  if(entries.length>=50)return ctx.reply('⚠️ Maximum 50 entries. Delete one first.');
  entries.push(kind==='note'?text:{text,done:false});await ctx.db.set(key,entries);return ctx.reply(`✅ ${kind==='note'?'Note':'Todo'} saved as number ${entries.length}.`);
 });
});}
function remove(kind){return cmd(`del${kind}`,[],`Delete one of your ${kind} entries.`,`del${kind} <number>`,async ctx=>{
 const key=`${kind}:${ctx.sender}`,n=Number(ctx.args[0]);if(ctx.args.length!==1||!Number.isSafeInteger(n)||n<1)return line(ctx,`del${kind} <number>`);
 return withLock(key,async()=>{const entries=await ctx.db.get(key,[]);if(!Array.isArray(entries)||n>entries.length)return ctx.reply('⚠️ No entry with that number.');entries.splice(n-1,1);await ctx.db.set(key,entries);return ctx.reply('✅ Entry deleted.');});
});}
const commands=[saved('note'),remove('note'),saved('todo'),remove('todo'),
 cmd('donetodo',[],'Mark one of your todo items complete.','donetodo <number>',async ctx=>{const key=`todo:${ctx.sender}`,n=Number(ctx.args[0]);if(ctx.args.length!==1||!Number.isSafeInteger(n)||n<1)return line(ctx,'donetodo <number>');return withLock(key,async()=>{const e=await ctx.db.get(key,[]);if(!Array.isArray(e)||!e[n-1])return ctx.reply('⚠️ No todo with that number.');if(typeof e[n-1]==='string')e[n-1]={text:e[n-1]};e[n-1].done=true;e[n-1].completedAt=Date.now();await ctx.db.set(key,e);return ctx.reply('✅ Todo marked complete.');});}),
 cmd('afk',[],'Set an away status that is shown when someone mentions you.','afk [reason]',async ctx=>{const reason=ctx.args.join(' ').trim();if(reason.length>200)return ctx.reply('⚠️ AFK reason must be 200 characters or fewer.');await ctx.db.set(`afk:${ctx.sender}`,{reason,at:Date.now()});await ctx.reply('💤 AFK status set. It will clear when you return.');}),
 cmd('unafk',[],'Clear your away status.','unafk',async ctx=>{const key=`afk:${ctx.sender}`;if(!await ctx.db.get(key))return ctx.reply('ℹ️ You are not marked AFK.');await ctx.db.del(key);return ctx.reply('✅ AFK status cleared.');}),
 cmd('remind',['reminder'],'Schedule a reminder in this chat.','remind <10s–365d> <text>',async ctx=>{const ms=reminders.duration(ctx.args[0]),text=ctx.args.slice(1).join(' ').trim();if(!ms||!text||text.length>500)return ctx.reply(`⚠️ Usage: ${config.prefix}remind 10m drink water\nUse s, m, h or d; minimum 10s, maximum 365d, text up to 500 characters.`);const key=reminders.key(ctx.sender);return withLock(key,async()=>{const list=await ctx.db.get(key,[]);if(!Array.isArray(list))return ctx.reply('⚠️ Reminder data is invalid; nothing was changed.');if(list.length>=50)return ctx.reply('⚠️ Maximum 50 reminders. Delete one first.');list.push({id:crypto.randomBytes(12).toString('hex'),sender:ctx.sender,chat:ctx.chat,text,dueAt:Date.now()+ms});await ctx.db.set(key,list);return ctx.reply('✅ Reminder saved. It is delivered when the bot is online.');});}),
 cmd('reminders',[],'List your scheduled reminders.','reminders',async ctx=>{const values=await ctx.db.get(reminders.key(ctx.sender),[]);if(!Array.isArray(values))return ctx.reply('⚠️ Reminder data is invalid.');return ctx.reply(values.length?`⏰ Your reminders\n${values.map((r,i)=>`${i+1}. ${r.text} — ${new Date(r.dueAt).toISOString()}`).join('\n')}\nTimes are UTC.`:'⏰ No reminders saved.');}),
 cmd('delreminder',[],'Delete one of your scheduled reminders.','delreminder <number>',async ctx=>{const key=reminders.key(ctx.sender),n=Number(ctx.args[0]);if(ctx.args.length!==1||!Number.isSafeInteger(n)||n<1)return line(ctx,'delreminder <number>');return withLock(key,async()=>{const values=await ctx.db.get(key,[]);if(!Array.isArray(values)||n>values.length)return ctx.reply('⚠️ No reminder with that number.');values.splice(n-1,1);await ctx.db.set(key,values);return ctx.reply('✅ Reminder deleted.');});}),
 cmd('readmore',[],'Add a WhatsApp read-more break between two text sections.','readmore <before>|<after>',async ctx=>{const text=ctx.args.join(' '),i=text.indexOf('|');if(i<1||!text.slice(i+1).trim()||text.length>2000)return ctx.reply(`⚠️ Usage: ${config.prefix}readmore visible text | hidden text`);await ctx.reply(`${text.slice(0,i).trim()}${'\u200e'.repeat(4001)}\n${text.slice(i+1).trim()}`);})
];
module.exports=commands;
