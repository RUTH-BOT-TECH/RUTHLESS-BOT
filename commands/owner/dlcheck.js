'use strict';
const health=require('../../lib/downloader-health'),runtime=require('../../lib/python-runtime');
function label(version){return /^\d{1,4}\.\d{1,3}\.\d{1,4}(?:[.a-z0-9-]{0,20})?$/i.test(version||'')?`available (${version})`:'available';}
module.exports={name:'dlcheck',aliases:['downloadercheck','ytcheck'],category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:10,description:'Check local downloader availability without installing or contacting APIs.',usage:'dlcheck (private chat)',async run(ctx){
 if(ctx.group)return ctx.reply('⚠️ Use this command in a private chat.');
 const [found,gallery]=await Promise.all([health.detect(),runtime.modulePython('gallery_dl')]);
 await ctx.reply(`🔎 Local downloader check\nyt-dlp: ${found.yt?label(found.yt.version):'not detected'}\ngallery-dl: ${gallery?label(gallery.version):'not detected'}\nFFmpeg: ${found.ffmpeg?'available':'not detected'}\n${!found.yt||!gallery?'Automatic setup may still be running or may have failed; see the owner-only [YouTube] logs.\n':''}This checks installed tools only, not live downloads or WhatsApp delivery.`);
}};
