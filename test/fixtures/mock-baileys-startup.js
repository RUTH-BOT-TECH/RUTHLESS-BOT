'use strict';
// Test-only fake WhatsApp socket; the real Baileys helpers and message handler remain loaded.
const Module=require('node:module'),{EventEmitter}=require('node:events');
const original=Module._load;
Module._load=function(request,parent,isMain){
 const loaded=original.apply(this,arguments);
 if(request!=='@whiskeysockets/baileys')return loaded;
 return {...loaded,default:()=>{
  const ev=new EventEmitter();
  const sock={ev,user:{id:'2348011111111@s.whatsapp.net'},sendMessage:async(jid,content)=>{if(process.env.TEST_CONNECTION_NOTICE==='1' && content.text?.includes('CONNECTED SUCCESSFULLY'))console.log(`Mock connection notice: ${jid}`);return {};},end:()=>{}};
  setTimeout(()=>ev.emit('connection.update',{connection:'open'}),20).unref();
  return sock;
 }};
};
