const { inner, matchParticipant, resolveParticipant, downloadMediaMessage } = require('./group');
const { getText, box } = require('../handler');
const { isOwner, phoneJid, clean } = require('./owner');
const { WAMessageStubType } = require('@whiskeysockets/baileys');
const pino = require('pino');
const log = pino({level:'silent'});
const hist = new Map(), recent = new Map();
const key = (chat, name) => `group:${chat}:${name}`;
const mention = id => '@' + clean(id);
const limit = 50*1024*1024;
function viewOnce(m) {
  for (let i=0;i<5 && m;i++) {
    if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) return true;
    m=m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message;
  }
  return false;
}
async function mediaBuffer(sock, msg) {
  const m=inner(msg.message), data=m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage;
  if (!data) throw Error('Unsupported media');
  if (Number(data.fileLength || 0)>limit) throw Error('Media exceeds 50 MB');
  const stream=await downloadMediaMessage(msg,'stream',{}, { logger:log, reuploadRequest:sock.updateMediaMessage });
  const parts=[]; let size=0;
  for await (const chunk of stream) { size+=chunk.length; if (size>limit) { stream.destroy?.(); throw Error('Media exceeds 50 MB'); } parts.push(chunk); }
  return Buffer.concat(parts);
}
async function eligible(sock,chat,raw,alt) {
  const meta=await sock.groupMetadata(chat), p=await resolveParticipant(sock,meta.participants,raw);
  const bot=await resolveParticipant(sock,meta.participants,sock.user?.id) || await resolveParticipant(sock,meta.participants,sock.user?.lid);
  if (!p || p.admin || !bot?.admin) return false;
  const pn=await phoneJid(sock,raw,p.phoneNumber || alt);
  return !!pn && !await isOwner(sock,raw,pn);
}
async function enforce(sock,msg,db,name,mode) {
  const chat=msg.key.remoteJid, raw=msg.key.participant;
  try { if (!await eligible(sock,chat,raw,msg.key.participantAlt)) return false; }
  catch { return false; }
  // Moderation deletions must not trigger the anti-delete replay.
  recent.delete(`${chat}:${msg.key.id}`);
  try { await sock.sendMessage(chat,{delete:msg.key}); }
  catch { console.warn(`${name}: could not delete message`); return false; }
  if (mode==='warn' || mode==='kick') {
    const canonical=await phoneJid(sock,raw,msg.key.participantAlt) || raw;
    const wk=`warn:${chat}:${canonical}`, count=(await db.get(wk,0))+1;
    if (mode==='kick' || count>=3) {
      try {
        const result=await sock.groupParticipantsUpdate(chat,[raw],'remove');
        if (Array.isArray(result) && result.some(x=>x.status && String(x.status)!=='200')) throw Error('rejected');
        await db.set(wk,0); await sock.sendMessage(chat,{text:box(`🛡️ ${mention(raw)} removed for ${name}.`),mentions:[raw]});
      } catch { await db.set(wk,count); await sock.sendMessage(chat,{text:box(`⚠️ ${mention(raw)} has ${count} warning(s); removal failed.`),mentions:[raw]}); }
    } else { await db.set(wk,count); await sock.sendMessage(chat,{text:box(`⚠️ ${mention(raw)}: ${name}, warning ${count}/3.`),mentions:[raw]}); }
  }
  return true;
}
async function replay(sock,msg,label) {
  const chat=msg.key.remoteJid, id=msg.key.participant, m=inner(msg.message);
  const prefix=`${label} ${mention(id)}`;
  if (m.conversation || m.extendedTextMessage) return sock.sendMessage(chat,{text:box(`${prefix}\n${getText(msg.message)}`),mentions:[id]});
  const data=m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage;
  if (!data) return sock.sendMessage(chat,{text:box(`${prefix}\nContent type cannot be restored.`),mentions:[id]});
  try {
    const buffer=await mediaBuffer(sock,msg), text=box(`${prefix}${data.caption ? `\n${data.caption}` : ''}`), common={mentions:[id]};
    if (m.imageMessage) return sock.sendMessage(chat,{image:buffer,caption:text,...common});
    if (m.videoMessage) return sock.sendMessage(chat,{video:buffer,caption:text,...common});
    if (m.documentMessage) return sock.sendMessage(chat,{document:buffer,mimetype:data.mimetype || 'application/octet-stream',fileName:data.fileName || 'document',caption:text,...common});
    await sock.sendMessage(chat,{text,mentions:[id]});
    if (m.audioMessage) return sock.sendMessage(chat,{audio:buffer,mimetype:data.mimetype || 'audio/ogg',ptt:!!data.ptt});
    if (m.stickerMessage) return sock.sendMessage(chat,{sticker:buffer});
  } catch (e) { return sock.sendMessage(chat,{text:box(`${prefix}\nMedia unavailable or exceeds 50 MB.`),mentions:[id]}); }
}
async function processIncoming(sock, msg, db) {
  if (!msg.message || msg.key.fromMe || !msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') return false;
  const chat=msg.key.remoteJid, settings=await db.get('settings:global',{});
  if (settings.autoread) try { await sock.readMessages([msg.key]); } catch(e) { console.warn('Autoread:',e.message); }
  if (settings.autoreact) try { await sock.sendMessage(chat,{react:{text:['👍','✨','💙','😊'][Math.floor(Math.random()*4)],key:msg.key}}); } catch(e) { console.warn('Autoreact:',e.message); }
  if (!chat.endsWith('@g.us') || !msg.key.participant) return false;
  const raw=msg.key.participant;
  try { if (!await eligible(sock,chat,raw,msg.key.participantAlt)) return false; } catch { return false; }
  const m=inner(msg.message), text=getText(msg.message), normalized=text.trim().toLowerCase();
  if (await db.get(key(chat,'protection:antidelete'),'off')==='on' && msg.key.id && !viewOnce(msg.message) && !m.protocolMessage) {
    recent.set(`${chat}:${msg.key.id}`,{msg,at:Date.now()});
    while (recent.size>500) recent.delete(recent.keys().next().value);
  }
  if (viewOnce(msg.message) && await db.get(key(chat,'protection:antiviewonce'),'off')==='on') {
    try { await replay(sock,msg,'👁️ View-once content from'); } catch(e) { console.warn('antiviewonce:',e.message); }
  }
  const now=Date.now(), id=`${chat}:${raw}`, previous=hist.get(id) || {times:[],last:0,repeated:0,text:''};
  previous.times=previous.times.filter(t=>t>now-8000); previous.times.push(now);
  previous.repeated=normalized && normalized===previous.text ? previous.repeated+1 : 1; previous.text=normalized; hist.set(id,previous);
  if (hist.size>5000) hist.delete(hist.keys().next().value);
  const slow=await db.get(key(chat,'slowmode'),0), violationSlow=slow && previous.last && now-previous.last<slow*1000;
  previous.last=now;
  const data=Object.values(m).find(v=>v && typeof v==='object' && v.contextInfo)?.contextInfo || {};
  const isMedia=!!(m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage);
  const badwords=await db.get(key(chat,'badwords'),[]), botprefixes=await db.get(key(chat,'botprefixes'),[]);
  const tests={
    antilink:/(?:https?:\/\/|chat\.whatsapp\.com\/)/i.test(text), antispam:previous.times.length>5,
    antibadword:badwords.some(w=>normalized.includes(w)), antitoxic:badwords.some(w=>normalized.includes(w)),
    antibot:botprefixes.some(prefix=>(msg.key.id || '').toUpperCase().startsWith(prefix)),
    antiflood:!!normalized && previous.repeated>=4, antitag:(data.mentionedJid || []).length>5,
    antimention:(data.mentionedJid || []).length>0, antichannel:!!data.forwardedNewsletterMessageInfo,
    antistatus:!!(m.groupStatusMentionMessage || m.statusMentionMessage), antiforward:!!data.isForwarded || Number(data.forwardingScore)>0,
    antimedia:isMedia, antisticker:!!m.stickerMessage, antiimage:!!m.imageMessage, antivideo:!!m.videoMessage,
    antiaudio:!!m.audioMessage, antidoc:!!m.documentMessage, antilongtext:text.length>1500
  };
  let found=violationSlow ? ['slowmode','delete'] : null;
  if (!found) for (const [name,match] of Object.entries(tests)) if (match) {
    const mode=await db.get(key(chat,`protection:${name}`),'off'); if (mode!=='off') { found=[name,mode]; break; }
  }
  if (found) return enforce(sock,msg,db,...found);
  const pornMode=await db.get(key(chat,'protection:antiporn'),'off');
  if (pornMode!=='off' && (m.imageMessage || m.stickerMessage)) {
    // All heavy inference runs in a worker; downloads and queue are bounded.
    const scan=async () => {
      const results=await require('./nsfw-queue').classifyLazy(() => mediaBuffer(sock,msg));
      const score=results.filter(x=>['Porn','Hentai'].includes(x.className)).reduce((n,x)=>n+x.probability,0);
      if (score>=0.90 && await db.get(key(chat,'protection:antiporn'),'off')===pornMode) await enforce(sock,msg,db,'antiporn',pornMode);
    };
    scan().catch(e=>console.warn('antiporn skipped:',e.message));
  }
  return false;
}
async function messageUpdates(sock, updates, db) {
  for (const item of updates) {
    if (item.update?.messageStubType!==WAMessageStubType.REVOKE) continue;
    const chat=item.key?.remoteJid, id=item.key?.id; if (!chat || !id) continue;
    const entry=recent.get(`${chat}:${id}`); recent.delete(`${chat}:${id}`);
    if (!entry || Date.now()-entry.at>30*60*1000 || await db.get(key(chat,'protection:antidelete'),'off')!=='on') continue;
    // Recheck privileges on revocation; never replay admin/owner content.
    try { if (await eligible(sock,chat,entry.msg.key.participant,entry.msg.key.participantAlt)) await replay(sock,entry.msg,'🗑️ Deleted by'); }
    catch(e) { console.warn('antidelete:',e.message); }
  }
}
async function participantsUpdate(sock, update, db) {
  if (!['add','remove'].includes(update.action)) return;
  const kind=update.action==='add'?'welcome':'goodbye';
  const greet=await db.get(key(update.id,kind),false), fake=update.action==='add' && await db.get(key(update.id,'protection:antifake'),'off')==='on';
  if (!greet && !fake) return;
  const meta=await sock.groupMetadata(update.id), allowed=await db.get(key(update.id,'allowedcodes'),[]);
  const template=await db.get(key(update.id,`${kind}:template`),kind==='welcome' ? 'Welcome {user} to {group}! Members: {count}' : 'Goodbye {user} from {group}. Members: {count}');
  for (const member of update.participants) {
    const jid=typeof member==='string' ? member : member.id; if (!jid) continue;
    if (fake && allowed.length) {
      try {
        const p=await resolveParticipant(sock,meta.participants,jid), pn=await phoneJid(sock,jid,p?.phoneNumber);
        if (pn && !allowed.some(prefix=>clean(pn).startsWith(prefix)) && await eligible(sock,update.id,jid,p?.phoneNumber)) {
          const result=await sock.groupParticipantsUpdate(update.id,[jid],'remove');
          if (Array.isArray(result) && result.some(x=>x.status && String(x.status)!=='200')) throw Error('rejected');
          await sock.sendMessage(update.id,{text:box(`🛡️ ${mention(jid)} removed: phone prefix not allowed.`),mentions:[jid]});
          await new Promise(r=>setTimeout(r,1000)); continue;
        }
      } catch(e) { console.warn('antifake:',e.message); }
    }
    if (greet) {
      const text=template.replaceAll('{user}',mention(jid)).replaceAll('{group}',meta.subject || 'group').replaceAll('{count}',String(meta.participants.length));
      try { await require('./event-images').send({sock,db,chat:update.id,event:kind,user:jid,text:box(text),mentions:[jid]}); }
      catch { await sock.sendMessage(update.id,{text:box(text),mentions:[jid]}); }
    }
    if (update.participants.length>1) await new Promise(r=>setTimeout(r,1000));
  }
}
module.exports={processIncoming,participantsUpdate,messageUpdates,viewOnce,mediaBuffer};
