'use strict';const config=require('../../config'),speech=require('../../lib/text-to-speech');
module.exports={name:'tts',aliases:['aivoice','text2speech'],category:'ai',description:'Speak text as an Opus voice note using the unofficial Google Translate speech endpoint.',usage:'tts [--lang=en] <text>',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:10,async run(ctx){
 const args=[...ctx.args];let lang='en';if(args[0]?.startsWith('--lang='))lang=args.shift().slice(7);const text=args.join(' ').trim();
 if(!text||Array.from(text).length>speech.MAX_CHARS||!speech.LANGUAGES.has(lang))return ctx.reply(`⚠️ Usage: ${config.prefix}tts [--lang=en] <text, max ${speech.MAX_CHARS} characters>\nLanguages: ${[...speech.LANGUAGES].join(', ')}\nExample: ${config.prefix}tts Hello there`);
 await ctx.reply('⏳ Creating a voice note using the unofficial Google Translate speech service. Your text is sent to Google.');
 try{const audio=await speech.synthesize(text,lang);await ctx.sock.sendMessage(ctx.chat,{audio,mimetype:'audio/ogg; codecs=opus',ptt:true},{quoted:ctx.msg});ctx.markReplied();}
 catch(e){await ctx.reply(e.message.includes('busy')?'⏳ Speech generator is busy. Try again shortly.':'⚠️ Speech generation failed or was rate-limited. Please try again. Source: Google Translate (unofficial).');}
}};
