'use strict';
// Names are observed from WhatsApp message metadata only; never infer them from message text.
const {normalize,phoneJid}=require('./owner'),{context}=require('./group');
const {withLock}=require('./game-lock');
const KEY='profileclone:active',DAY=86400000,MAX=1500,names=new Map();
function validName(s){return typeof s==='string'&&s.trim()&&s.length<=60&&!/[\x00-\x1f\x7f]/.test(s);}
function validJid(j){return /^\d{6,20}@(lid|s\.whatsapp\.net)$/.test(j||'');}
function putName(key,name){names.delete(key);names.set(key,{name:name.trim(),at:Date.now()});while(names.size>MAX)names.delete(names.keys().next().value);}
function remember(msg){
 const k=msg?.key,n=msg?.pushName;if(!k||k.fromMe||!k.remoteJid?.endsWith('@g.us')||!k.id||!validName(n))return;
 const jid=normalize(k.participant);if(!validJid(jid))return;
 putName(`${k.remoteJid}|${jid}`,n);putName(`contact|${jid}`,n);
 // Alternate identities are accepted only from the same authenticated WhatsApp message.
 const alt=normalize(k.participantAlt);if(validJid(alt)&&alt.split('@')[1]!==jid.split('@')[1]){putName(`${k.remoteJid}|${alt}`,n);putName(`contact|${alt}`,n);}
}
function rememberContacts(contacts){for(const c of contacts||[]){if(!c||!validName(c.notify))continue;const ids=[c.id,c.lid,c.phoneNumber].map(normalize).filter(validJid);for(const id of new Set(ids))putName(`contact|${id}`,c.notify);}}
function targetName(chat,jid){const n=normalize(jid);for(const key of [`${chat}|${n}`,`contact|${n}`]){const x=names.get(key);if(x&&Date.now()-x.at<7*DAY)return x.name;}return null;}
async function resolveName(sock,chat,jid){
 const id=normalize(jid),direct=targetName(chat,id);if(direct)return direct;
 // Ask the Signal repository for an exact LID/phone mapping, never compare numeric prefixes.
 const map=sock.signalRepository?.lidMapping;let mapped;
 try{mapped=normalize(id?.endsWith('@lid')?await map?.getPNForLID(id):await map?.getLIDForPN(id));}catch{}
 if(validJid(mapped)&&mapped.split('@')[1]!==id.split('@')[1]){const result=targetName(chat,mapped);if(result)return result;}
 // Group metadata is a fallback only when one unambiguous participant matches.
 try{const meta=await sock.groupMetadata(chat);if(meta?.id&&meta.id!==chat)return null;
  const members=Array.isArray(meta?.participants)?meta.participants:[];
  const matches=members.filter(p=>[p.id,p.lid,p.phoneNumber].map(normalize).includes(id));
  if(matches.length!==1)return null;
  const ids=[...new Set([matches[0].id,matches[0].lid,matches[0].phoneNumber].map(normalize).filter(validJid))];
  if(ids.filter(x=>x.endsWith('@lid')).length>1||ids.filter(x=>x.endsWith('@s.whatsapp.net')).length>1)return null;
  for(const other of ids){if(other!==id&&members.filter(p=>[p.id,p.lid,p.phoneNumber].map(normalize).includes(other)).length!==1)return null;}
  const options=[...new Set(ids.map(other=>targetName(chat,other)).filter(Boolean))];return options.length===1?options[0]:null;
 }catch{return null;}
}
async function picture(sock,jid){const u=await sock.profilePictureUrl(jid,'image');if(!u)throw Error('Profile photo unavailable');return require('./whatsapp-profile').downloadProfile(u);}
async function getBio(sock,jid){try{const result=await sock.fetchStatus(jid),item=Array.isArray(result)?result.find(x=>normalize(x.id)===normalize(jid))||result[0]:result;let status=item?.status;if(status&&typeof status==='object')status=status.status;return typeof status==='string'&&status.length>0&&status.length<=139?status:null;}catch{return null;}}
async function durable(db){if(db.backupController){await db.backupController.backup();return;}if(!db.serviceUrl&&!db.directStore)throw Error('Durable settings storage required');}
async function restoreUnlocked(sock,db,state){
 const bot=await phoneJid(sock,sock.user?.id);if(!bot||bot!==state.bot)throw Error('Linked account changed');
 // Repeat all steps on retry: WhatsApp updates are idempotent. Keep the backup until all succeed.
 await sock.updateProfileName(state.name);await sock.updateProfilePicture(bot,Buffer.from(state.picture,'base64'));
 if(state.bio!==null)await sock.updateProfileStatus(state.bio);
 await db.del(KEY);try{await durable(db);}catch{await db.set(KEY,{...state,restored:true});throw Error('Restore succeeded, backup cleanup pending');}
}
async function clone(sock,db,chat,jid){return withLock(KEY,async()=>{
 if(await db.get(KEY,null))throw Error('A profile clone or restore is already pending');
 const bot=await phoneJid(sock,sock.user?.id);if(!bot)throw Error('Linked account unavailable');
 const display=await resolveName(sock,chat,jid),own=sock.user?.name;
 if(!validName(display))throw Error('NAME_UNAVAILABLE');if(!validName(own))throw Error('ORIGINAL_NAME_UNAVAILABLE');
 // Both photos must be visible before any updates, so restoration is possible.
 let original,desired;try{[original,desired]=await Promise.all([picture(sock,bot),picture(sock,jid)]);}catch{throw Error('PHOTO_UNAVAILABLE');}
 const [beforeBio,targetBio]=await Promise.all([getBio(sock,bot),getBio(sock,jid)]);const copyBio=beforeBio!==null&&targetBio!==null;
 const state={bot,name:own,picture:original.toString('base64'),bio:copyBio?beforeBio:null,expires:Date.now()+DAY,created:Date.now(),phase:'prepared'};
 await db.set(KEY,state);try{await durable(db);}catch{await db.del(KEY);throw Error('BACKUP_UNAVAILABLE');}
 try{await sock.updateProfileName(display);await sock.updateProfilePicture(bot,desired);if(copyBio)await sock.updateProfileStatus(targetBio);await db.set(KEY,{...state,phase:'active'});await durable(db);}
 catch(err){try{await restoreUnlocked(sock,db,state);}catch{throw Error('RESTORE_PENDING');}throw Error('UPDATE_FAILED_RESTORED');}
 return {bio:copyBio,expires:state.expires};
 });}
async function restore(sock,db,{expiredOnly=false}={}){return withLock(KEY,async()=>{const state=await db.get(KEY,null);if(!state)return 'none';if(expiredOnly&&state.expires>Date.now()&&!state.restored&&state.phase==='active')return 'waiting';await restoreUnlocked(sock,db,state);return 'restored';});}
function start(sock,db){let busy=false,closed=false;const run=()=>{if(closed||busy)return;busy=true;restore(sock,db,{expiredOnly:true}).catch(()=>console.warn('Profile restore pending; will retry.')).finally(()=>{busy=false;});};run();const t=setInterval(run,60000);t.unref();return ()=>{closed=true;clearInterval(t);};}
async function selected(ctx){const info=context(ctx.msg);if(info.remoteJid&&info.remoteJid!==ctx.chat)return null;const raw=info.participant||info.mentionedJid?.[0];const jid=normalize(raw);return jid&&/^\d{6,20}@(lid|s\.whatsapp\.net)$/.test(jid)?jid:null;}
module.exports={KEY,remember,rememberContacts,targetName,resolveName,selected,clone,restore,start};
