'use strict';
const config=require('../../config');const gallery=require('../../lib/gallery');
module.exports={name:'tiktokslide',aliases:[],category:'downloaders',description:'Download the images from a public TikTok photo post (maximum 20 slides and 50 MB total).',usage:'tiktokslide <TikTok photo-post URL>',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:10,async run(ctx){
 const link=ctx.args[0];if(ctx.args.length!==1||!gallery.validTikTokPhoto(link))return ctx.reply(`⚠️ Usage: ${config.prefix}tiktokslide <TikTok photo-post URL>\nExample: ${config.prefix}tiktokslide https://www.tiktok.com/@natgeo/photo/7466527368044088619`);
 await ctx.reply('⏳ Downloading slideshow…');await gallery.sendSlides(ctx,link);
}};
