'use strict';
const config=require('../../config'),ai=require('../../lib/ai-image'),media=require('../../lib/media');
const defaults={category:'ai',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:20};
async function run(ctx,avatar){
 const source=media.sourceMessage(ctx.msg),info=media.mediaInfo(source),input=ctx.args.join(' ').trim();
 if(!info||info.type!=='image'||(!avatar&&!input)||input.length>450)return ctx.reply(`⚠️ Reply to or caption an image with ${config.prefix}${avatar?'aiavatar [style]':'img2img <prompt>'}. Use only images you have permission to share; the image and prompt go to AI Horde volunteers.`);
 const prompt=avatar?`Create a stylized digital avatar inspired by this image${input?': '+input:'.'}`:input;
 try{const data=await media.download(ctx.sock,source);const x=await ai.generate(prompt,{source:data});await ctx.sock.sendMessage(ctx.chat,{image:x.data,mimetype:'image/png',caption:ctx.box(`🎨 AI-generated ${avatar?'avatar':'image transformation'}\nModel: ${x.model}\nSource: AI Horde\nResults may differ from the source.`)},{quoted:ctx.msg});ctx.markReplied();}
 catch(e){await ctx.reply(e.message.includes('busy')?'⏳ Image generator is busy. Try again shortly.':'⚠️ Image transformation failed, timed out or the image was unsupported. Try a different image or retry later. Source: AI Horde.');}
}
module.exports=[
 {...defaults,name:'img2img',aliases:[],description:'Transform an image; the image and prompt are sent to AI Horde volunteers.',usage:'img2img <prompt> (reply to or caption an image)',run:ctx=>run(ctx,false)},
 {...defaults,name:'aiavatar',aliases:[],description:'Create a stylized avatar; the image and prompt are sent to AI Horde volunteers.',usage:'aiavatar [style] (reply to or caption an image)',run:ctx=>run(ctx,true)}
];
