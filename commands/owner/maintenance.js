'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),config=require('../../config'),diagnostics=require('../../lib/diagnostics');
const base={category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:0,aliases:[]};
const privateChat=ctx=>!ctx.group&&ctx.chat===ctx.sender&&/^\d{6,15}@s\.whatsapp\.net$/.test(ctx.sender);
function cmd(name,description,usage,run){return {...base,name,description,usage,async run(ctx){if(!privateChat(ctx))return ctx.reply('⚠️ Use this command in a verified owner private chat.');return run(ctx);}};}
async function oldTemps(now=Date.now()){
 const root=os.tmpdir(),entries=await fs.readdir(root,{withFileTypes:true});let removed=0,failed=0;
 for(const entry of entries){if(!entry.isDirectory()||!/^ruthless-(?:media|dl|ttp|gallery)-[A-Za-z0-9]+$/.test(entry.name))continue;
  const target=path.join(root,entry.name);try{const st=await fs.lstat(target);if(!st.isDirectory()||st.isSymbolicLink()||st.mtimeMs>now-24*60*60*1000)continue;await fs.rm(target,{recursive:true,force:true});removed++;}catch{failed++;}
 }
 return {removed,failed};
}
module.exports=[
 ...['shutdown','reboot'].map(name=>cmd(name,'Request a graceful process stop; the host controls restart.',`${name} confirm`,async ctx=>{
  if(ctx.args.length!==1||ctx.args[0]!=='confirm')return ctx.reply(`⚠️ ${name} stops the process and attempts a session/settings flush. Your host may restart it automatically; session recovery is not guaranteed. Use ${config.prefix}${name} confirm.`);
  if(typeof ctx.db.requestProcessStop!=='function')return ctx.reply('⚠️ Process control is unavailable. No stop was requested.');
  await ctx.reply('⏳ Requesting a graceful stop. The host controls whether and when the process restarts; check Render logs.');
  if(!ctx.db.requestProcessStop())return ctx.reply('⚠️ A shutdown is already in progress.');
 })),
 cmd('clearcache','Clear the in-memory anti-delete cache.','clearcache confirm',async ctx=>{
  if(ctx.args.length!==1||ctx.args[0]!=='confirm')return ctx.reply(`⚠️ This clears the in-memory anti-delete cache only. Use ${config.prefix}clearcache confirm.`);
  require('../../lib/group-events').clearAntideleteCache();return ctx.reply('✅ In-memory anti-delete cache cleared. Settings, sessions and other caches were not deleted.');
 }),
 cmd('cleartmp','Remove old bot-owned temporary folders.','cleartmp confirm',async ctx=>{
  if(ctx.args.length!==1||ctx.args[0]!=='confirm')return ctx.reply(`⚠️ This removes recognized bot temporary folders older than 24 hours. Use ${config.prefix}cleartmp confirm.`);
  const x=await oldTemps();return ctx.reply(`✅ Temporary-folder cleanup: ${x.removed} removed, ${x.failed} failed. Recent folders and unrelated files were not touched.`);
 }),
 ...[['logs',false],['errorlogs',true]].map(([name,errors])=>cmd(name,'Show recent sanitized in-memory runtime event codes.',name,async ctx=>{
  if(ctx.args.length)return ctx.reply(`⚠️ Usage: ${config.prefix}${name}`);
  const rows=diagnostics.list(errors);return ctx.reply(`📋 Recent sanitized bot events (${rows.length}; in-memory only, not Render logs):\n${rows.slice(-30).map(x=>`${x.at} ${x.level.toUpperCase()} ${x.code}`).join('\n')||'No recorded events.'}`);
 })),
 cmd('clearlogs','Clear sanitized in-memory runtime event codes.','clearlogs confirm',async ctx=>{
  if(ctx.args.length!==1||ctx.args[0]!=='confirm')return ctx.reply(`⚠️ This clears only in-memory bot event codes, not Render logs. Use ${config.prefix}clearlogs confirm.`);
  return ctx.reply(`✅ Cleared ${diagnostics.clear()} in-memory event codes. Render logs were not changed.`);
 })
];
module.exports.oldTemps=oldTemps;
