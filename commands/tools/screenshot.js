'use strict';
const screenshot=require('../../lib/screenshot'),config=require('../../config');
module.exports={name:'screenshot',aliases:['ss'],category:'tools',description:'Capture a public website using Thum.io; the URL is sent to that provider.',usage:'ss <public URL>',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:15,async run(ctx){
 const raw=ctx.args[0];if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}ss <public URL>\nExample: ${config.prefix}ss https://example.com`);
 try{screenshot.parseUrl(raw);}catch{return ctx.reply(`⚠️ Enter a valid public HTTP or HTTPS URL. Example: ${config.prefix}ss https://example.com`);}
 try{const image=await screenshot.capture(raw);await ctx.sock.sendMessage(ctx.chat,{image,caption:ctx.box('📸 Website screenshot\nURL sent to Thum.io. Results may be cached.')},{quoted:ctx.msg});ctx.markReplied();}
 catch(e){await ctx.reply(e.message.includes('busy')?'⏳ Screenshot service is busy. Try again shortly.':e.message.includes('Blocked')||e.message.includes('Invalid')?'⚠️ Only public websites can be captured.':'⚠️ Screenshot failed or the provider is unavailable. Source: Thum.io.');}
}};
