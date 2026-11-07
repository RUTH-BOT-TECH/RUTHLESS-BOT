'use strict';const ai=require('./ai-text'),{phoneJid}=require('./owner'),{box}=require('../handler');const last=new Map(),active=new Set();
async function maybeReply(sock,msg,db,ctx){
 if(msg.key.fromMe||!ctx.text||ctx.text.length>1500||!await db.get(ctx.group?`group:${ctx.chat}:chatbot`:'extra:chatbot-dm',false))return;
 const prefixes=ctx.group?await db.get(`group:${ctx.chat}:botprefixes`,[]):[];if(['BAE5',...prefixes].some(p=>(msg.key.id||'').toUpperCase().startsWith(p)))return;
 const sender=await phoneJid(sock,ctx.sender,ctx.alt)||ctx.sender;if(ctx.group&&(await db.get(`group:${ctx.chat}:ban:${ctx.sender}`,false)||await db.get(`group:${ctx.chat}:ban:${sender}`,false)))return;
 if(active.has(ctx.chat)||Date.now()-(last.get(ctx.chat)||0)<30000)return;active.add(ctx.chat);last.set(ctx.chat,Date.now());if(last.size>1000)last.delete(last.keys().next().value);
 try{const result=await ai.run({chat:ctx.chat,sender},ctx.text,`${ai.IDENTITY} Be helpful and concise.`,{memory:true});await sock.sendMessage(ctx.chat,{text:box(`🤖 ${ai.BRAND}\n${result}`)},{quoted:msg});}catch{try{await sock.sendMessage(ctx.chat,{text:box('⚠️ Chatbot is unavailable or rate-limited. Source: LLM7.')},{quoted:msg});}catch{}}finally{active.delete(ctx.chat);}
}
module.exports={maybeReply};
