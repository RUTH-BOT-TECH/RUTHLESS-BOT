const { clean, isOwner, phoneJid } = require('./owner');
const { getContentType, downloadMediaMessage } = require('@whiskeysockets/baileys');
function inner(message) {
  let m = message || {};
  for (let i = 0; i < 4; i++) {
    const next = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message || m.documentWithCaptionMessage?.message;
    if (!next) break; m = next;
  }
  return m;
}
function context(msg) {
  const m = inner(msg.message); const type = getContentType(m);
  return m[type]?.contextInfo || {};
}
async function target(ctx, { self = false } = {}) {
  const info = context(ctx.msg);
  const typed = ctx.args.find(v => /^\+?\d{6,15}$/.test(v));
  return info.participant || info.mentionedJid?.[0] || (typed ? `${typed.replace(/\D/g, '')}@s.whatsapp.net` : null) || (self ? ctx.sender : null);
}
function matchParticipant(participants, jid) {
  if (!jid) return null;
  const n = jid.replace(/:\d+@/, '@');
  return participants.find(p => [p.id, p.phoneNumber, p.lid].filter(Boolean).some(x => x.replace(/:\d+@/, '@') === n)) || null;
}
async function resolveParticipant(sock, participants, jid) {
  const direct = matchParticipant(participants, jid); if (direct) return direct;
  if (!jid) return null;
  try {
    const mapping = sock.signalRepository?.lidMapping;
    const other = jid.endsWith('@lid') ? await mapping?.getPNForLID(jid) : await mapping?.getLIDForPN(jid);
    return matchParticipant(participants, other);
  } catch { return null; }
}
async function groupContext(ctx, { botAdmin = false } = {}) {
  const meta = await ctx.sock.groupMetadata(ctx.chat);
  const sender = await resolveParticipant(ctx.sock, meta.participants, ctx.msg.key.participant) || await resolveParticipant(ctx.sock, meta.participants, ctx.sender);
  if (!sender?.admin && !ctx.owner) { await ctx.reply('⛔ Only group admins can use this'); return null; }
  const bot = await resolveParticipant(ctx.sock, meta.participants, ctx.sock.user?.id) || await resolveParticipant(ctx.sock, meta.participants, ctx.sock.user?.lid);
  if (botAdmin && !bot?.admin) { await ctx.reply('⛔ I need to be a group admin'); return null; }
  return { meta, sender, bot };
}
async function safeTarget(ctx, meta, jid, { allowAbsent = false } = {}) {
  if (!jid) { await ctx.reply(`⚠️ Usage: ${ctx.usage}\nExample: ${ctx.example}`); return null; }
  const p = await resolveParticipant(ctx.sock, meta.participants, jid);
  if (!p && !allowAbsent) { await ctx.reply('⚠️ Target is not a group member or could not be resolved.'); return null; }
  const candidate = p?.id || jid;
  const alt = p?.phoneNumber || (jid.endsWith('@s.whatsapp.net') ? jid : null);
  const owner = await isOwner(ctx.sock, candidate, alt);
  const bot = !!(await resolveParticipant(ctx.sock, [p || { id: jid }], ctx.sock.user?.id) || await resolveParticipant(ctx.sock, [p || { id: jid }], ctx.sock.user?.lid));
  // LIDs are protected when they cannot be mapped: never guess whether they are the owner.
  const pn = await phoneJid(ctx.sock, candidate, alt);
  if ((!pn && candidate.endsWith('@lid')) || owner || bot || (p?.admin && !ctx.owner)) {
    await ctx.reply('⛔ Target is protected or their identity cannot be verified.'); return null;
  }
  return candidate;
}
function okResult(r) { return !Array.isArray(r) || r.every(x => !x.status || String(x.status) === '200'); }
async function sendMention(ctx, text, mentions) { await ctx.reply(text, { mentions }); }
module.exports = { inner, context, target, matchParticipant, resolveParticipant, groupContext, safeTarget, okResult, sendMention, downloadMediaMessage };
