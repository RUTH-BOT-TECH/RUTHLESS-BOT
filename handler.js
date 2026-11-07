const config = require('./config');
const { isOwner, hasRole, phoneJid, normalize } = require('./lib/owner');
const { checkCooldown } = require('./lib/cooldown');
const { presence } = require('./lib/presence');
const { resolveParticipant, groupSenderPhone } = require('./lib/group');
const box = text => `╭─❖ ${config.botName}\n${String(text).split('\n').map(line => `│ ➜ ${line}`).join('\n')}\n╰────────────`;
function unwrap(message) {
  let m = message || {};
  for (let i = 0; i < 4; i++) {
    const next = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message;
    if (!next) break; m = next;
  }
  return m;
}
function getText(message) {
  const m = unwrap(message);
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '';
}
async function handle(sock, msg, commands, db) {
  if (!msg?.message || !msg.key?.remoteJid || msg.key.remoteJid === 'status@broadcast') return;
  const chat = msg.key.remoteJid; const group = chat.endsWith('@g.us');
  const sender = group ? msg.key.participant : (msg.key.fromMe ? sock.user?.id : chat);
  if (!sender) return;
  // In a sent DM, remoteJidAlt identifies the other party, not the sender.
  const alt = group ? msg.key.participantAlt : (msg.key.fromMe ? null : msg.key.remoteJidAlt);
  const text = getText(msg.message).trim();
  const storedPrefix=await db.get('settings:prefix',config.prefix);if(typeof storedPrefix==='string'&&/^[.!#$%&?~]{1,3}$/.test(storedPrefix))config.prefix=storedPrefix;
  let resolved=await phoneJid(sock,sender,alt), verifiedMeta=null;
  // Baileys can deliver a group sender as a LID without participantAlt. First
  // resolve a genuine self-message against the socket's exact own LID, then
  // try that exact participant's phone number in current group metadata.
  if (!resolved && group && text.startsWith(config.prefix) && normalize(sender)?.endsWith('@lid')) {
    const ownLid=normalize(sock.user?.lid), raw=normalize(sender), ownPhone=normalize(sock.user?.id);
    if(msg.key.fromMe===true && ownLid && raw===ownLid && /^\d{6,15}@s\.whatsapp\.net$/.test(ownPhone||'')) resolved=ownPhone;
    if(!resolved)try{
      const metadata=await sock.groupMetadata(chat);
      if(!metadata?.id || metadata.id===chat){verifiedMeta=metadata;resolved=groupSenderPhone(metadata,sender);}
    }catch{/* No identity guess on unavailable metadata. */}
  }
  const owner = await isOwner(sock, resolved||sender, resolved?null:alt, db);
  if (await require('./lib/owner-access').denied(sock, msg, db, owner, resolved)) return;
  if (!msg.key.fromMe) await presence(sock, chat, db);
  if (await require('./lib/bot-mode').current(db) === 'self' && !owner && !msg.key.fromMe) return;
  if (!text.startsWith(config.prefix)) { await require('./lib/chatbot').maybeReply(sock,msg,db,{chat,group,sender,alt,owner,text});return; }
  const parts = text.slice(config.prefix.length).trim().split(/\s+/);
  const name = (parts.shift() || '').toLowerCase();
  const command = commands.get(name);
  if (!command) {
    // Avoid treating punctuation-only messages as commands or flooding a busy chat.
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) return;
    try {
      const identity=resolved || sender;
      if (group && !owner && (await db.get(`group:${chat}:ban:${sender}`,false) || await db.get(`group:${chat}:ban:${identity}`,false))) return;
      if (await checkCooldown(db,identity,'unknown-command',10)) return;
      await sock.sendMessage(chat,{text:box(`⚠️ Command not available yet. Use ${config.prefix}menu to see available commands.`)},{quoted:msg});
    } catch { console.error('Could not send unknown-command reply.'); }
    return;
  }
  let replied = false;
  const reply = async (text, options = {}) => { replied = true; return sock.sendMessage(chat, { text: box(text), ...options }, { quoted: msg }); };
  try {
    resolved ||= sender;
    if (group && !owner && (await db.get(`group:${chat}:ban:${sender}`, false) || await db.get(`group:${chat}:ban:${resolved}`, false))) return;
    if (command.ownerOnly && !owner) return;
    if (command.groupOnly && !group) return reply('This command can only be used in a group.');
    const moderator = group && await hasRole(sock, resolved, null, db, 'mod');
    if (command.adminOnly && !moderator && !owner) {
      const meta = verifiedMeta || await sock.groupMetadata(chat);
      if(meta?.id && meta.id!==chat)throw Error('Group metadata mismatch');
      const pn = resolved;
      const participant = await resolveParticipant(sock, meta.participants, sender) || await resolveParticipant(sock, meta.participants, pn);
      if (!participant?.admin && !owner) return reply('Only group admins can use this');
    }
    const premium = await hasRole(sock, resolved, null, db, 'prem');
    const remaining = (owner || premium) ? 0 : await checkCooldown(db, resolved, command.name, command.cooldown);
    if (remaining) return reply(`⏳ Try again in ${Math.floor(remaining / 60)}m ${remaining % 60}s.`);
    await db.set(`seen:${resolved}`, { name: msg.pushName || '', at: Date.now() });
    // A reaction acknowledges an accepted command, not its eventual success.
    // Never let a failed or slow reaction prevent the actual command reply.
    if (msg.key.id && await db.get('settings:commandreact', true)) {
      let timer;
      try {
        await Promise.race([
          Promise.resolve().then(() => sock.sendMessage(chat, { react: { text: require('./lib/command-reactions').reactionFor(command,name,parts), key: msg.key } })),
          new Promise(resolve => { timer=setTimeout(resolve, 3000); timer.unref?.(); })
        ]);
      } catch { console.warn('Could not send command reaction.'); }
      finally { clearTimeout(timer); }
    }
    await command.run({ sock, msg, sender: resolved, args: parts, commands, reply, db, chat, group, owner, moderator, box, invoked: name,
      markReplied: () => { replied = true; } });
    if (!replied) await reply('✅ Done.');
  } catch (error) {
    require('./lib/diagnostics').record('COMMAND_FAILED','error');
    console.error(`Command ${name} failed:`, error.message);
    try { await reply('⚠️ Something went wrong. Please try again later.'); } catch (sendError) { console.error('Reply failed:', sendError.message); }
  }
}
module.exports = { handle, getText, box };
