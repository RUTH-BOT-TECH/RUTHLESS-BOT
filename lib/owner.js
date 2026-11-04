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
async function isOwner(sock, jid, alternate) {
  if (!config.ownerNumber) return false;
  const pn = await phoneJid(sock, jid, alternate);
  return !!pn && clean(pn) === config.ownerNumber;
}
module.exports = { phoneJid, isOwner, clean, normalize };
