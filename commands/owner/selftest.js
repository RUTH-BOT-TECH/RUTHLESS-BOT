'use strict';
const selftest=require('../../lib/selftest');let running=false;
module.exports={name:'selftest',aliases:[],category:'owner',ownerOnly:true,adminOnly:false,groupOnly:false,cooldown:30,description:'Safely exercise commands with synthetic inputs in an isolated environment.',usage:'selftest (private chat)',async run(ctx){
 if(ctx.group)return ctx.reply('⚠️ Use selftest in a private owner chat.');
 if(running)return ctx.reply('⏳ A selftest is already running.');
 running=true;
 try{
  const result=await selftest.run(ctx.commands);
  await ctx.sock.sendMessage(ctx.chat,{document:Buffer.from(result.text,'utf8'),mimetype:'text/plain',fileName:'selftest.txt',caption:result.summary},{quoted:ctx.msg});ctx.markReplied();
 }finally{running=false;}
}};
