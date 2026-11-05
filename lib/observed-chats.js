'use strict';
// Keep only minimal metadata for incoming messages seen in this process, not message content.
const chats=new Map(),MAX=100;
function observe(msg){
 const k=msg?.key,jid=k?.remoteJid,stamp=Number(msg?.messageTimestamp);
 if(!k||k.fromMe||!k.id||typeof k.id!=='string'||k.id.length>200||!Number.isSafeInteger(stamp)||stamp<1||!(/^[0-9-]+@g\.us$/.test(jid||'')||/^\d{6,20}@(s\.whatsapp\.net|lid)$/.test(jid||'')))return;
 if(jid.endsWith('@g.us')&&(!k.participant||typeof k.participant!=='string'))return;
 const previous=chats.get(jid);if(previous&&previous.messageTimestamp>stamp)return;
 const key={remoteJid:jid,id:k.id,fromMe:false,...(k.participant?{participant:k.participant}:{})};
 chats.delete(jid);chats.set(jid,{key,messageTimestamp:stamp});while(chats.size>MAX)chats.delete(chats.keys().next().value);
}
function snapshot(exclude){return [...chats.entries()].filter(([jid])=>jid!==exclude).map(([jid,msg])=>({jid,msg:structuredClone(msg)}));}
function forget(jid,id){if(chats.get(jid)?.key?.id===id)chats.delete(jid);}
function clear(){chats.clear();}
module.exports={observe,snapshot,forget,clear,MAX};
