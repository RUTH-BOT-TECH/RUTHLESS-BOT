'use strict';const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');const {withLock}=require('./game-lock');const fx=require('./imagefx');
const ALLOWED=new Set(['menu','welcome','goodbye']),ROOT=path.join(__dirname,'../assets'),LIMIT=10*1024*1024;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function files(event,root=ROOT){
 const folders=event==='menu'?['menus','menu']:[event],out=[],seen=new Set();
 for(const name of folders){const folder=path.join(root,name),entries=await fs.readdir(folder,{withFileTypes:true}).catch(()=>[]);
  for(const e of entries){if(!e.isFile()||!/^.{1,150}\.(?:png|jpe?g|webp)$/i.test(e.name))continue;try{const f=path.join(folder,e.name),st=await fs.stat(f);if(st.size>LIMIT||!st.size)continue;const b=await fs.readFile(f),m=await sharp(b,{limitInputPixels:40000000}).metadata(),digest=hash(b);if(['jpeg','png','webp'].includes(m.format)&&!seen.has(digest)){out.push(b);seen.add(digest);}}catch{}}
 }
 return out;
}
async function card(buffer){return sharp(buffer,{limitInputPixels:40000000}).rotate().resize(512,512,{fit:'cover'}).jpeg({quality:82}).toBuffer();}
async function send({sock,db,chat,event,user,text,mentions=[],quoted}){
 if(!ALLOWED.has(event))throw Error('Invalid image event');
 return withLock(`event-image:${chat}`,async()=>{
  const textOnly=()=>sock.sendMessage(chat,{text,mentions},quoted?{quoted}:{});
  if(chat.endsWith('@g.us')&&!await db.get(`group:${chat}:eventimg`,true))return textOnly();
  const key=`event:image:last:${chat}`,last=await db.get(key,''),candidates=await files(event);let selected=candidates.filter(x=>hash(x)!==last);let image=selected.length?selected[crypto.randomInt(selected.length)]:null;
  if(!image){try{const p=await fx.getAvatar(sock,user);const b=await card(p.buffer);if(hash(b)!==last)image=b;}catch{}}
  if(!image){try{const b=await card(await fs.readFile(path.join(ROOT,'default-pfp.jpg')));if(hash(b)!==last)image=b;}catch{}}
  if(!image)return textOnly();
  try{await db.set(key,hash(image));}catch{return textOnly();}
  try{return await sock.sendMessage(chat,{image,caption:text,mentions},quoted?{quoted}:{});}catch{return textOnly();}
 });
}
module.exports={send,files,card,hash};
