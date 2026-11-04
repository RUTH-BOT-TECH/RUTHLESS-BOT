'use strict';const {phoneJid}=require('./owner'),{withLock}=require('./game-lock');
async function record(sock,msg,db){const chat=msg?.key?.remoteJid,raw=msg?.key?.participant;if(!chat?.endsWith('@g.us')||!raw||msg.key.fromMe||!msg.message)return;const id=await phoneJid(sock,raw,msg.key.participantAlt)||raw,key=`group:${chat}:activity:${id}`;await withLock(`activity:${chat}:${id}`,async()=>{const previous=await db.get(key,{count:0,last:0});await db.set(key,{count:Number(previous.count||0)+1,last:Date.now()});});}
module.exports={record};
