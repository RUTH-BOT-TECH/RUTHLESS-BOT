'use strict';
const config=require('../../config');
const {boundedBody}=require('../../lib/public-files');
const packageRe=/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
async function json(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});if(!r.ok){await r.body?.cancel();throw Error('unavailable');}return JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'));}
function link(id){return `https://f-droid.org/en/packages/${id}/`;}
async function lookup(q){
 if(packageRe.test(q)&&q.length<=200){const d=await json(`https://f-droid.org/api/v1/packages/${encodeURIComponent(q)}`);if(d.packageName!==q||!Number.isSafeInteger(d.suggestedVersionCode)||!d.packages?.some(p=>p.versionCode===d.suggestedVersionCode))throw Error('invalid response');const v=d.packages.find(p=>p.versionCode===d.suggestedVersionCode);return [{name:q,summary:`Suggested version: ${String(v.versionName||'unknown').slice(0,80)}`,url:link(q),apk:`https://f-droid.org/repo/${q}_${d.suggestedVersionCode}.apk`}];}
 const d=await json(`https://search.f-droid.org/api/search_apps?q=${encodeURIComponent(q)}`);
 return (Array.isArray(d.apps)?d.apps:[]).slice(0,20).flatMap(a=>{try{const u=new URL(a.url);const m=u.pathname.match(/^\/en\/packages\/([^/]+)\/?$/);if(u.protocol!=='https:'||u.hostname!=='f-droid.org'||!m||!packageRe.test(m[1]))return [];return [{name:String(a.name||m[1]).replace(/[\r\n]/g,' ').slice(0,100),summary:String(a.summary||'').replace(/[\r\n]/g,' ').slice(0,120),url:link(m[1])}];}catch{return [];}}).slice(0,5);
}
module.exports={name:'apk',aliases:['apkdl'],category:'downloaders',description:'Search F-Droid or look up an Android package (F-Droid only).',usage:'apk <app name or package ID>',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:5,async run(ctx){
 const q=ctx.args.join(' ').trim();if(!q||q.length>120)return ctx.reply(`⚠️ Usage: ${config.prefix}apk <app name or package ID>\nExample: ${config.prefix}apk org.fdroid.fdroid`);
 try{const a=await lookup(q);if(!a.length)return ctx.reply('⚠️ No apps found in F-Droid. Try another search or package ID.');await ctx.reply(`📱 F-Droid results\n${a.map((x,i)=>`${i+1}. ${x.name}\n${x.summary}\n${x.url}${x.apk?`\nAPK: ${x.apk}`:''}`).join('\n\n')}\nSource: F-Droid; review the app and verify its publisher before installation.`);}catch{await ctx.reply('⚠️ F-Droid lookup unavailable. Try again later or search at https://f-droid.org/.');}
},lookup};
