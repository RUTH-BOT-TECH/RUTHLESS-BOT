const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function presence(sock, jid, db) {
  const settings = await db.get('settings:global', {});
  const type = settings.autorecord ? 'recording' : settings.autotyping ? 'composing' : null;
  if (!type) return;
  try { await sock.presenceSubscribe(jid); await delay(500); await sock.sendPresenceUpdate(type, jid); await delay(2500); await sock.sendPresenceUpdate('paused', jid); }
  catch (error) { console.warn('Presence unavailable:', error.message); }
}
module.exports = { presence };
