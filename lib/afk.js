'use strict';
const {context}=require('./group'),{phoneJid,isOwner}=require('./owner'),{getText,box}=require('../handler'),config=require('../config');
const last=new Map();
function mention(jid){return '@'+String(jid).split('@')[0].split(':')[0];}
async function process(sock,msg,db){
 if(!msg?.message||!msg.key?.remoteJid||msg.key.remoteJid==='status@broadcast')return;
 const chat=msg.key.remoteJid,group=chat.endsWith('@g.us'),raw=group?msg.key.participant:(msg.key.fromMe?sock.user?.id:chat),alt=group?msg.key.participantAlt:msg.key.remoteJidAlt;if(!raw)return;
 const sender=await phoneJid(sock,raw,alt)||raw,owner=await isOwner(sock,raw,alt);
 if(await require('./bot-mode').current(db)==='self'&&!owner&&!msg.key.fromMe)return;
 if(group&&!owner&&(await db.get(`group:${chat}:ban:${raw}`,false)||await db.get(`group:${chat}:ban:${sender}`,false)))return;
 const prefix=await db.get('settings:prefix',config.prefix),text=getText(msg.message).trim(),name=text.startsWith(prefix)?text.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase():'';
 const active=await db.get(`afk:${sender}`);
 if(active&&!['afk','unafk'].includes(name)){await db.del(`afk:${sender}`);await sock.sendMessage(chat,{text:box(`👋 Welcome back ${mention(sender)}. AFK status cleared.`),mentions:[sender]},{quoted:msg});}
 const c=context(msg),targets=[...new Set([...(c.mentionedJid||[]),...(c.participant?[c.participant]:[])])].slice(0,5);
 for(const rawTarget of targets){
  const target=await phoneJid(sock,rawTarget)||rawTarget;if(!target||target===sender)continue;const value=await db.get(`afk:${target}`);if(!value)continue;
  const throttle=`${chat}:${target}`,now=Date.now();if(now-(last.get(throttle)||0)<60000)continue;last.set(throttle,now);if(last.size>2000)last.delete(last.keys().next().value);
  const elapsed=Math.max(0,Math.floor((now-(Number(value.at)||now))/60000)),reason=String(value.reason||'No reason provided').replace(/[\r\n]+/g,' ').slice(0,200);
  await sock.sendMessage(chat,{text:box(`💤 ${mention(target)} is AFK (${elapsed}m).\nReason: ${reason}`),mentions:[target]},{quoted:msg});
 }
}
module.exports={process};
