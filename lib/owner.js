const config = require('../config');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const clean = jid => (jid || '').split('@')[0].split(':')[0];
function normalize(jid) { try { return jid ? jidNormalizedUser(jid) : null; } catch { return null; } }
async function phoneJid(sock, jid, alternate) {
  if (alternate && normalize(alternate)?.endsWith('@s.whatsapp.net')) return normalize(alternate);
  const identity = normalize(jid);
  if (!identity) return null;
  if (identity.endsWith('@s.whatsapp.net')) return identity;
  if (!identity.endsWith('@lid')) return null;
  try {
    const mapped = normalize(await sock.signalRepository?.lidMapping?.getPNForLID(identity));
    return mapped?.endsWith('@s.whatsapp.net') ? mapped : null;
  } catch { return null; }
}
async function hasRole(sock, jid, alternate, db, role) {
  if (!db || !['owner','sudo','mod','prem'].includes(role)) return false;
  const pn = await phoneJid(sock,jid,alternate);
  if (!pn || !/^\d{6,15}@s\.whatsapp\.net$/.test(pn)) return false;
  return await db.get(`roles:${role}:${pn}`,false) === true;
}
async function isOwner(sock, jid, alternate, db) {
  const pn = await phoneJid(sock, jid, alternate);
  if (!pn) return false;
  if (config.ownerNumber && clean(pn) === config.ownerNumber) return true;
  return await hasRole(sock,pn,null,db,'owner') || await hasRole(sock,pn,null,db,'sudo');
}
module.exports = { phoneJid, isOwner, hasRole, clean, normalize };
