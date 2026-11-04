const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('../lib/database');
const { createSession } = require('../lib/session');
const { loadCommands } = require('../lib/loader');
const { getText, handle } = require('../handler');

test('command aliases and message extraction', () => {
  const map = loadCommands(); assert.equal(map.get('help'), map.get('menu')); assert.equal(map.get('speed'), map.get('ping'));
  assert.equal(getText({ ephemeralMessage: { message: { imageMessage: { caption: '.ping' } } } }), '.ping');
  assert.equal(getText({ extendedTextMessage: { text: '.help' } }), '.help');
});

test('database persists values and session snapshot round trips', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruthless-test-'));
  try {
    const db = await new Database('', path.join(dir, 'a.json')).connect();
    await Promise.all([db.set('user:a', { language: 'es' }), db.set('user:b', 5)]);
    const a = await createSession(db, ''); await a.saveCreds();
    await a.state.keys.set({ session: { abc: { key: Buffer.from('hello') } } });
    const id = await a.exportSession();
    const db2 = await new Database('', path.join(dir, 'b.json')).connect();
    const b = await createSession(db2, id);
    assert.deepEqual((await b.state.keys.get('session', ['abc'])).abc.key, Buffer.from('hello'));
    assert.equal((await db.get('user:a')).language, 'es');
    const reopened = await new Database('', path.join(dir, 'a.json')).connect();
    assert.equal(await reopened.get('user:b'), 5);
    await db.close(); await db2.close(); await reopened.close();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('handler replies to commands and validates input', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruthless-test-'));
  try {
    const db = await new Database('', path.join(dir, 'data.json')).connect();
    const sent = []; const sock = { user: { id: '234123456789@s.whatsapp.net' }, sendMessage: async (jid, payload) => { sent.push(payload); } };
    const msg = text => ({ key: { remoteJid: '234998877665@s.whatsapp.net' }, message: { conversation: text }, pushName: 'Tester' });
    const commands = loadCommands();
    await handle(sock, msg('.rate 8'), commands, db); assert.match(sent.at(-1).text, /Usage:/);
    await handle(sock, msg('.language es'), commands, db); assert.equal((await db.get('user:234998877665@s.whatsapp.net')).language, 'es');
    await handle(sock, msg('.rate 5'), commands, db); assert.match(sent.at(-1).text, /5.00\/5/);
    await handle(sock, msg('.help weather'), commands, db); assert.match(sent.at(-1).text, /weather/);
    await db.close();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Baileys LID mapping persists in the session Signal store', async () => {
  const pino=require('pino'); const {addTransactionCapability}=require('@whiskeysockets/baileys');
  const {LIDMappingStore}=require(path.join(path.dirname(require.resolve('@whiskeysockets/baileys')),'Signal/lid-mapping.js'));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-lid-real-'));
  const db=await new Database('',path.join(dir,'db.json')).connect();
  try {
    const session=await createSession(db,''), logger=pino({level:'silent'});
    const keys=addTransactionCapability(session.state.keys,logger,{maxCommitRetries:3,delayBetweenTriesMs:10});
    const first=new LIDMappingStore(keys,logger,async()=>[]);
    await first.storeLIDPNMappings([{lid:'123456789@lid',pn:'234111111111@s.whatsapp.net'}]); first.close();
    const second=new LIDMappingStore(keys,logger,async()=>[]);
    const result=await second.getPNForLID('123456789@lid');
    assert.equal(require('../lib/owner').normalize(result),'234111111111@s.whatsapp.net'); second.close();
  } finally {await db.close(); await fs.rm(dir,{recursive:true,force:true});}
});


test('unknown commands receive a rate-limited explanation instead of silence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-unknown-'));const db=await new Database('',path.join(dir,'db.json')).connect();
 try{const sent=[],sock={user:{id:'234123456789@s.whatsapp.net'},sendMessage:async(_jid,p)=>sent.push(p)};const m=text=>({key:{remoteJid:'234998877665@s.whatsapp.net'},message:{conversation:text}});const commands=loadCommands();
 await handle(sock,m('.stillmissing'),commands,db);assert.match(sent.at(-1).text,/Command not available yet/);assert.match(sent.at(-1).text,/\.menu/);const count=sent.length;await handle(sock,m('.alsomissing'),commands,db);assert.equal(sent.length,count);
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
