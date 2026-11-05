const crypto = require('node:crypto');
const path = require('node:path');
const pino = require('pino');
const { default: makeWASocket, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const config = require('./config');
const Database = require('./lib/database');
const { createSession } = require('./lib/session');
const { parseShortSession, PairingClient, PairingError, SessionSync } = require('./lib/pairing-client');
const { DataBackup } = require('./lib/data-backup');
const { loadCommands } = require('./lib/loader');
const { handle } = require('./handler');
const { processIncoming, participantsUpdate, messageUpdates } = require('./lib/group-events');
const { processAutoDL } = require('./lib/autodl');
const gameState = require('./lib/game-state');
const extras = require('./lib/extra-events');
const groupGuards = require('./lib/group-guards');
const activity = require('./lib/activity');
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const diagnostics = require('./lib/diagnostics');
let connected = false;
const health = require('./lib/health').createHealth({port:config.port});
async function main() {
  if (!config.ownerNumber || !/^\d{6,15}$/.test(config.ownerNumber)) throw new Error('Set OWNER_NUMBER to 6–15 international digits.');
  const short = parseShortSession(config.sessionId);
  if (short?.origin) { if (!config.pairingApiUrl) config.pairingApiUrl = short.origin; if (!config.pairingSiteUrl) config.pairingSiteUrl = short.origin; }
  const digest = short?.id || crypto.createHash('sha256').update('ruthless-owner:'+config.ownerNumber).digest('hex').slice(0,32);
  const tenantId = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20)}`;
  const localDataFile = short ? path.join(__dirname,'database',`data-${short.id}.json`) : undefined;
  const db = await new Database(config.databaseUrl,localDataFile,{serviceUrl:config.databaseUrl ? '' : config.dataServiceUrl,serviceToken:config.dataServiceToken,allowDirectMongo:!!config.databaseUrl || config.allowDirectMongo,tenantId}).connect();
  let stopped = false, activeSocket = null, sessionSync = null, dataBackup = null, pairingClient = null, stopReminders = () => {}, stopProfileClone = () => {};
  if (short) {
    const client = pairingClient = new PairingClient(config.pairingApiUrl, config.sessionId);
    if (!config.databaseUrl && !config.dataServiceUrl) {
      dataBackup = new DataBackup(db, client, {clearCache: require('./lib/group-events').clearAntideleteCache, notify: async text => {if (!connected || !activeSocket) return false; await activeSocket.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, {text}); return true;}});
      db.backupController = dataBackup;
    }
    db.pairingClient = client;
    sessionSync = new SessionSync(client, db, {onContention: () => { console.warn('Session is still in use. Waiting for the previous bot to stop; check for duplicate deployments.'); health.start(); }, onError: code => { db.lastError = code; }, onLost: () => {
      stopped = true; connected = false; health.setConnected(false); stopReminders(); stopProfileClone();
      diagnostics.record('SESSION_LEASE_LOST','error');
      console.error('Session lease lost. The bot has stopped to prevent duplicate instances.');
      try { activeSocket?.end(); } catch {}
    }});
    try { await sessionSync.start(); if(dataBackup)await dataBackup.start(); } catch (e) { if (dataBackup) {dataBackup.closed=true;clearTimeout(dataBackup.timer);db.onChange=null;} await db.close(); throw e; }
  }
  // Keep automatic package writes after the exclusive session lease has been obtained.
  const youtubeDiagnostics = require('./lib/downloader-health').ensureStartup();
  const storedPrefix=await db.get('settings:prefix',config.prefix);if(typeof storedPrefix==='string'&&/^[.!#$%&?~]{1,3}$/.test(storedPrefix))config.prefix=storedPrefix;
  db.stopAfterDelete = () => { stopped = true; connected = false; stopReminders(); stopProfileClone(); health.setConnected(false); health.markNotReady(); if (sessionSync) { sessionSync.closed = true; sessionSync.stopTimers(); } if (dataBackup) { dataBackup.closed = true; clearTimeout(dataBackup.timer); db.onChange = null; } setTimeout(() => { try { activeSocket?.end(); } catch {} }, 100); };
  const auth = await createSession(db, sessionSync ? '' : config.sessionId, {onAuthChange: () => sessionSync?.changed()});
  const commands = loadCommands();
  await gameState.cleanup(db);
  const gameCleanup = setInterval(() => gameState.cleanup(db).catch(err => console.error('Game cleanup failed:', err.message)), 30000);
  gameCleanup.unref();
  health.start();
  let shouldExport = !auth.state.creds.registered && !config.sessionId;
  const connect = () => {
    if (stopped) return;
    let requested = false, stopExtras = () => {}, stopHeartbeat = () => {};
    const groupStatus = require('./lib/group-status');
    const sock = makeWASocket({ logger, auth: auth.state, browser: Browsers.ubuntu('Chrome'), printQRInTerminal: false, syncFullHistory: false, patchMessageBeforeSending: groupStatus.patchMessage });
    groupStatus.registerSocket(sock);
    // rc14 does not preserve Group Status stanza metadata on automatic retries.
    // Exclude those status envelopes from retry caching without changing normal message retries.
    if (sock.messageRetryManager) { try { groupStatus.guardRetryCache(sock); } catch { console.warn('Group Status retry guard unavailable; Group Status sending disabled.'); } }
    activeSocket = sock;
    const statuses=extras.statusQueue(sock,db);
    sock.ev.on('call', calls => { extras.calls(sock,calls,db).catch(err=>console.error('Call handling failed:',err.message)); });
    sock.ev.on('creds.update', () => { auth.saveCreds().then(() => sessionSync?.changed()).catch(err => console.error('Credential save failed:', err.message)); });
    sock.ev.on('connection.update', async update => {
      try {
        if ((update.qr || update.connection === 'connecting') && !auth.state.creds.registered && !requested) {
          requested = true;
          if (!/^\d{6,15}$/.test(config.pairingNumber)) { console.error('Set PAIRING_NUMBER (international digits) to pair this bot.'); return; }
          await new Promise(r => setTimeout(r, 2000));
          console.log(`Pairing code (keep private): ${await sock.requestPairingCode(config.pairingNumber)}`);
        }
        if (update.connection === 'open') {
          connected = true; diagnostics.record('WHATSAPP_CONNECTED'); health.setConnected(true); youtubeDiagnostics.then(async result => {if((!result.yt||!result.ffmpeg||result.updated===false)&&connected&&activeSocket===sock){const text=(!result.yt||!result.ffmpeg)?require('./lib/downloader-health').guidance:'⚠️ Automatic yt-dlp update failed. Downloads will use the installed version. See docs/setup-and-privacy.md to update it manually.';try{await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`,{text});}catch{console.warn('Could not deliver downloader setup notice privately to the owner.');}}}); stopReminders(); stopReminders=require('./lib/reminders').start(sock,db); stopExtras(); stopExtras=extras.startTimers(sock,db); stopProfileClone(); stopProfileClone=require('./lib/profile-clone').start(sock,db); console.log('WhatsApp connected.'); await auth.saveCreds(); sessionSync?.changed(); await dataBackup?.notifyPending(); stopHeartbeat(); if (config.heartbeat && pairingClient) stopHeartbeat = require('./lib/heartbeat').startHeartbeat({client:pairingClient,db,sock,ownerNumber:config.ownerNumber});
          if (shouldExport) {
            shouldExport = false;
            const id = await auth.exportSession();
            // No credentials in logs or group chats. Send to the deployer's DM only.
            try { await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, { text: `🔐 Your SESSION_ID is private. Store it securely; it grants access to the linked account.\n\n${id}` }); }
            catch (e) { console.error('Could not deliver SESSION_ID to owner DM:', e.message); }
          }
        }
        if (update.connection === 'close') {
          connected = false; diagnostics.record('WHATSAPP_DISCONNECTED','error'); health.setConnected(false); stopReminders(); stopExtras(); stopProfileClone(); stopHeartbeat(); const status = update.lastDisconnect?.error?.output?.statusCode;
          if (status === DisconnectReason.loggedOut) { console.error(`Session expired, pair again at ${config.pairingSiteUrl || '<PAIRING_SITE_URL>'}`); stopped = true; await sessionSync?.close({save:false}); }
          else { console.warn('Disconnected; retrying in 5 seconds.'); setTimeout(connect, 5000); }
        }
      } catch (err) { console.error('Connection update error:', err.message); }
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) (async () => {
        if(msg?.key?.remoteJid==='status@broadcast'){statuses.enqueue(msg);return;}
        require('./lib/observed-chats').observe(msg); require('./lib/profile-clone').remember(msg);
        try { await require('./lib/afk').process(sock,msg,db); } catch(err) { console.error('AFK processing failed.'); }
        try { await activity.record(sock,msg,db); } catch(err) { console.error('Activity record failed:',err.message); }
        let deleted = false;
        try { deleted = await processIncoming(sock, msg, db, {commands}); } catch (err) { console.error('Group processing error:', err.message); }
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
  let shutdownStarted = false;
  const shutdown = async () => { if (shutdownStarted) return; shutdownStarted = true; stopped = true; stopReminders(); stopProfileClone(); clearInterval(gameCleanup); health.close(); try { activeSocket?.end(); } catch {} try { await dataBackup?.close(); } catch { console.error('Settings backup failed during shutdown; local data retained.'); } try { await sessionSync?.close(); } catch { console.error('Session upload failed during shutdown; local snapshot retained.'); } await db.close(); process.exit(0); };
  db.requestProcessStop = () => { if (shutdownStarted) return false; setTimeout(() => shutdown().catch(() => { console.error('Graceful shutdown failed.'); process.exitCode = 1; }), 1000); return true; };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
main().catch(e => {
  if (e instanceof PairingError && e.status === 401) console.error(`Session expired, pair again at ${config.pairingSiteUrl || '<PAIRING_SITE_URL>'}`);
  else console.error('Startup failed:', e.message);
  health.markNotReady();
  const finish = () => { health.close(); process.exitCode = 1; };
  if (e instanceof PairingError && (!e.status || e.status === 409)) { console.error('Could not safely verify an exclusive session lease. Waiting 60 seconds before exit.'); setTimeout(finish, 60000); }
  else finish();
});
