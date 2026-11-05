'use strict';
const {phoneJid}=require('./owner');
async function denied(sock,msg,db,owner=false,verifiedPhone=null){
 if(owner||msg?.key?.fromMe)return false;
 const chat=msg?.key?.remoteJid;if(!chat)return false;
 const group=chat.endsWith('@g.us'),raw=group?msg.key.participant:chat,alt=group?msg.key.participantAlt:msg.key.remoteJidAlt;
 if(group&&await db.get(`ownerban:chat:${chat}`,false))return true;
 const pn=verifiedPhone || await phoneJid(sock,raw,alt);
 return !!(pn&&await db.get(`ownerban:user:${pn}`,false));
}
module.exports={denied};
