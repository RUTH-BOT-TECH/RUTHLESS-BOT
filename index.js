const http = require('node:http');
const pino = require('pino');
const { default: makeWASocket, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const config = require('./config');
const Database = require('./lib/database');
const { createSession } = require('./lib/session');
const { loadCommands } = require('./lib/loader');
const { handle } = require('./handler');
const { processIncoming, participantsUpdate, messageUpdates } = require('./lib/group-events');
const { processAutoDL } = require('./lib/autodl');
const gameState = require('./lib/game-state');
const extras = require('./lib/extra-events');
const groupGuards = require('./lib/group-guards');
const activity = require('./lib/activity');
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
let connected = false;
const health = http.createServer((req, res) => {
  if (req.url !== '/health') { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(connected ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: connected, uptime: Math.floor(process.uptime()) }));
});
async function main() {
  if (!config.ownerNumber || !/^\d{6,15}$/.test(config.ownerNumber)) throw new Error('Set OWNER_NUMBER to 6–15 international digits.');
  const db = await new Database(config.databaseUrl).connect();
  const storedPrefix=await db.get('settings:prefix',config.prefix);if(typeof storedPrefix==='string'&&/^[.!#$%&?~]{1,3}$/.test(storedPrefix))config.prefix=storedPrefix;
  const auth = await createSession(db, config.sessionId);
  const commands = loadCommands();
  await gameState.cleanup(db);
  const gameCleanup = setInterval(() => gameState.cleanup(db).catch(err => console.error('Game cleanup failed:', err.message)), 30000);
  gameCleanup.unref();
  health.listen(config.port, '0.0.0.0', () => console.log(`Health server listening on ${config.port}`));
  let stopped = false;
  let shouldExport = !auth.state.creds.registered && !config.sessionId;
  const connect = () => {
    if (stopped) return;
    let requested = false, stopExtras = () => {};
    const sock = makeWASocket({ logger, auth: auth.state, browser: Browsers.ubuntu('Chrome'), printQRInTerminal: false, syncFullHistory: false });
    const statuses=extras.statusQueue(sock,db);
    sock.ev.on('call', calls => { extras.calls(sock,calls,db).catch(err=>console.error('Call handling failed:',err.message)); });
    sock.ev.on('creds.update', () => { auth.saveCreds().catch(err => console.error('Credential save failed:', err.message)); });
    sock.ev.on('connection.update', async update => {
      try {
        if ((update.qr || update.connection === 'connecting') && !auth.state.creds.registered && !requested) {
          requested = true;
          if (!/^\d{6,15}$/.test(config.pairingNumber)) { console.error('Set PAIRING_NUMBER (international digits) to pair this bot.'); return; }
          await new Promise(r => setTimeout(r, 2000));
          console.log(`Pairing code (keep private): ${await sock.requestPairingCode(config.pairingNumber)}`);
        }
        if (update.connection === 'open') {
          connected = true; stopExtras(); stopExtras=extras.startTimers(sock,db); console.log('WhatsApp connected.'); await auth.saveCreds();
          if (shouldExport) {
            shouldExport = false;
            const id = await auth.exportSession();
            // No credentials in logs or group chats. Send to the deployer's DM only.
            try { await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, { text: `🔐 Your SESSION_ID is private. Store it securely; it grants access to the linked account.\n\n${id}` }); }
            catch (e) { console.error('Could not deliver SESSION_ID to owner DM:', e.message); }
          }
        }
        if (update.connection === 'close') {
          connected = false; stopExtras(); const status = update.lastDisconnect?.error?.output?.statusCode;
          if (status === DisconnectReason.loggedOut) { console.error('Logged out. Clear auth state and pair again.'); stopped = true; }
          else { console.warn('Disconnected; retrying in 5 seconds.'); setTimeout(connect, 5000); }
        }
      } catch (err) { console.error('Connection update error:', err.message); }
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) (async () => {
        if(msg?.key?.remoteJid==='status@broadcast'){statuses.enqueue(msg);return;}
        try { await activity.record(sock,msg,db); } catch(err) { console.error('Activity record failed:',err.message); }
        let deleted = false;
        try { deleted = await processIncoming(sock, msg, db); } catch (err) { console.error('Group processing error:', err.message); }
        if (!deleted) {
          try { await processAutoDL(sock, msg, db); } catch (err) { console.error('Autodownload error:', err.message); }
          await handle(sock, msg, commands, db);
        }
      })().catch(err => console.error('Message error:', err.message));
    });
    sock.ev.on('messages.update', updates => { messageUpdates(sock, updates, db).catch(err => console.error('Message update error:', err.message)); });
    sock.ev.on('group-participants.update', update => { (async()=>{await groupGuards.guard(sock,update,db);await participantsUpdate(sock,update,db);})().catch(err => console.error('Group event error:', err.message)); });
  };
  connect();
  const shutdown = async () => { stopped = true; clearInterval(gameCleanup); health.close(); await db.close(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
main().catch(e => { console.error('Startup failed:', e.message); process.exitCode = 1; });
