'use strict';
const config=require('../../config');
const files=require('../../lib/public-files');
const specs=[['mediafire','https://www.mediafire.com/file/zulayut7xnratjf/test.txt/file'],['gdrive','https://drive.google.com/file/d/0B9P1L--7Wd2vU3VUVlFnbTgtS2c/view'],['mega','https://mega.nz/file/<id>#<key>']];
module.exports=specs.map(([name,example])=>({name,aliases:[],category:'downloaders',description:`Download one public ${name} file (up to 50 MB).`,usage:`${name} <public file URL>`,ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:5,async run(ctx){
 const link=ctx.args[0];if(ctx.args.length!==1||!files.checkedUrl(link,name))return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <public file URL>\nExample: ${config.prefix}${name} ${example}`);
await files.sendFile(ctx,link,name);
}}));
