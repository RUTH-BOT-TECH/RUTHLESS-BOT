const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const PREFIX = 'auth:';
const encode = value => JSON.parse(JSON.stringify(value, BufferJSON.replacer));
const decode = value => JSON.parse(JSON.stringify(value), BufferJSON.reviver);

// MongoDB is the live source of truth: Signal keys change after pairing.
async function createSession(db, sessionId) {
  if (!(await db.get(PREFIX + 'creds')) && sessionId) {
    let snapshot;
    try { snapshot = JSON.parse(Buffer.from(sessionId.replace(/^RUTHLESS~/, ''), 'base64url').toString('utf8')); }
    catch { throw new Error('Invalid SESSION_ID'); }
    if (!snapshot || snapshot.version !== 1 || !snapshot.entries || !snapshot.entries['auth:creds']) throw new Error('Invalid SESSION_ID contents');
    for (const [key, value] of Object.entries(snapshot.entries)) {
      if (!key.startsWith(PREFIX)) throw new Error('Invalid SESSION_ID entry');
      await db.set(key, value);
    }
  }
  const saved = await db.get(PREFIX + 'creds');
  const creds = saved ? decode(saved) : initAuthCreds();
  const state = { creds, keys: {
    async get(type, ids) {
      const result = {};
      for (const id of ids) {
        const item = await db.get(`${PREFIX}key:${type}:${id}`);
        if (item !== null) {
          let value = decode(item);
          if (type === 'app-state-sync-key') value = proto.Message.AppStateSyncKeyData.fromObject(value);
          result[id] = value;
        }
      }
      return result;
    },
    async set(data) {
      for (const [type, entries] of Object.entries(data)) for (const [id, value] of Object.entries(entries)) {
        const key = `${PREFIX}key:${type}:${id}`;
        if (value == null) await db.del(key); else await db.set(key, encode(value));
      }
    }
  } };
  return { state, saveCreds: () => db.set(PREFIX + 'creds', encode(creds)),
    async exportSession() {
      const entries = Object.fromEntries(await db.list(PREFIX));
      return 'RUTHLESS~' + Buffer.from(JSON.stringify({ version: 1, entries })).toString('base64url');
    }
  };
}
module.exports = { createSession };
