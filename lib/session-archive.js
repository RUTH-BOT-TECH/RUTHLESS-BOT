'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const zlib = require('node:zlib');
const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);
const MAX_ARCHIVE = 4 * 1024 * 1024;
const MAX_JSON = 12 * 1024 * 1024;
function validate(value) {
  if (!value || value.version !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries) || !value.entries['auth:creds'] || Object.keys(value.entries).some(k => !k.startsWith('auth:'))) throw Error('Invalid session archive');
  return value;
}
async function pack(entries) {
  const json = Buffer.from(JSON.stringify(validate({version: 1, entries})));
  if (json.length > MAX_JSON) throw Error('Session is too large');
  const result = await gzip(json);
  if (result.length > MAX_ARCHIVE) throw Error('Compressed session is too large');
  return result;
}
async function unpack(archive) {
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ARCHIVE) throw Error('Invalid session archive');
  const data = await gunzip(archive, { maxOutputLength: MAX_JSON });
  return validate(JSON.parse(data.toString('utf8')));
}
// Atomic local writes; file and directory are private. Not yet wired to the bot.
async function writeLocal(directory, archive, revision, updatedAt) {
  if (!Number.isSafeInteger(revision) || revision < 1 || !Number.isFinite(Date.parse(updatedAt))) throw Error('Invalid local session metadata');
  await unpack(archive);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const dest = path.join(directory, 'snapshot.json');
  const temp = path.join(directory, `.session-${crypto.randomBytes(12).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify({revision, updatedAt: new Date(updatedAt).toISOString(), archive: archive.toString('base64')}), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, dest);
  } finally { await fs.rm(temp, {force:true}); }
}
async function readLocal(directory) {
  let text;
  try { const stat = await fs.stat(path.join(directory, 'snapshot.json')); if (stat.size > MAX_ARCHIVE * 1.4 + 1024) throw Error('Local session is too large'); text = await fs.readFile(path.join(directory, 'snapshot.json'), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const value = JSON.parse(text);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isFinite(Date.parse(value.updatedAt)) || typeof value.archive !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.archive)) throw Error('Invalid local session metadata');
  const archive = Buffer.from(value.archive, 'base64'); await unpack(archive);
  return {revision: value.revision, updatedAt: value.updatedAt, archive};
}
module.exports = { pack, unpack, writeLocal, readLocal, MAX_JSON };
