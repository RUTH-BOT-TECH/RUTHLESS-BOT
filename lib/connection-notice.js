'use strict';

function formatConnectionNotice({botName, prefix}) {
 return `╭─❖ ${botName}\n│\n│  🟢 CONNECTED SUCCESSFULLY\n│\n│  Your bot is online and ready.\n│  Thanks for choosing RUTHLESS MD ⚡\n│\n│  📖 Type ${prefix}menu to explore commands.\n│\n│  Your WhatsApp. Your bot. Your rules.\n╰────────────`;
}

// Once per socket: repeated open events must not spam the owner. A new socket
// creates a new notifier, so a genuine reconnect can be announced again.
function createConnectionNotice(sock, config) {
 let sent = false;
 return async function notify() {
  if (sent) return;
  sent = true;
  try {
   await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, {text: formatConnectionNotice(config)});
  } catch {
   // Connection health and startup must not depend on this optional message.
   console.warn('Could not deliver connection notice privately to the owner.');
  }
 };
}
module.exports = {formatConnectionNotice, createConnectionNotice};
