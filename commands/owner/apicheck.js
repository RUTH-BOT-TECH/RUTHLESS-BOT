'use strict';
const probes=require('../../lib/api-probes');
module.exports={name:'apicheck',aliases:[],category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:30,description:'Quickly probe selected external text, image, audio and downloader APIs.',usage:'apicheck (private chat)',async run(ctx){
 if(ctx.group)return ctx.reply('⚠️ Use this command in a private chat.');
 const results=await probes.check();
 await ctx.reply(`🔎 External API check\n${results.map(x=>`${x.name}: ${x.detail}`).join('\n')}\n\nThese are limited API probes, not full command, generation, download or WhatsApp-delivery tests. No keys are sent.`);
}};
