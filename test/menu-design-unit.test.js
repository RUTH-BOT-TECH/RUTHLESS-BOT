'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const config = { botName: 'RUTHLESS MD', tagline: 'RUTHLESS MD', prefix: '.', mode: 'public' };
let sent;
Module._load = function(request, parent, isMain) {
  if (parent && parent.filename.endsWith('/commands/general/menu.js')) {
    if (request === '../../config') return config;
    if (request === '../../lib/owner') return { clean: x => x.split('@')[0] };
    if (request === '../../lib/event-images') return { send: async x => { sent = { text: x.text, mentions: x.mentions }; } };
    if (request === '../../lib/bot-mode') return { current: async db => db.mode };
  }
  return original.apply(this, arguments);
};
const menu = require('../commands/general/menu');
Module._load = original;
function context(args = [], invoked = 'menu') {
  const commands = new Map();
  for (let n = 0; n < 145; n++) {
    const name = 'command' + String(n).padStart(3, '0');
    commands.set(name, { name, aliases: [], category: 'ai', ownerOnly: false, description: 'test', usage: name });
  }
  commands.set('secret', { name: 'secret', category: 'owner', ownerOnly: true });
  const c = { args, invoked, commands, sender: '123@s.whatsapp.net', chat: '123@s.whatsapp.net', msg: {}, db: { mode: 'self' }, owner: false, markReplied() {}, sock: { sendMessage: async (_chat, payload) => { sent = payload; } } };
  return c;
}
test('new overview is dynamic and hides owner-only commands', async () => {
  process.env.BOT_OWNER_NAME = 'Test owner';
  const ctx = context(); await menu.run(ctx);
  assert.match(sent.text, /\*◈ RUTHLESS MD ◈\*/);
  assert.match(sent.text, /\*Owner\* : Test owner/);
  assert.match(sent.text, /\*Mode\* : self/);
  assert.match(sent.text, /\*Prefix\* : \[\.\]/);
  assert.match(sent.text, /\*Commands\* : 145/);
  assert.match(sent.text, /\.menu ai \(145\)/);
  assert.doesNotMatch(sent.text, /secret|\.menu owner/);
  assert.deepEqual(sent.mentions, [ctx.sender]);
  delete process.env.BOT_OWNER_NAME;
});
test('category pages preserve every command and enforce limits', async () => {
  const outputs = [];
  for (let page = 1; page <= 5; page++) {
    await menu.run(context(['ai', String(page)]));
    assert.match(sent.text, /\*AI MENU\*/);
    assert.match(sent.text, new RegExp(`${page}/5`));
    assert.ok(sent.text.length <= 900);
    assert.ok(sent.text.split('\n').length <= 40);
    outputs.push(sent.text);
  }
  for (let n = 0; n < 145; n++) assert.equal(outputs.join('\n').split('.command' + String(n).padStart(3, '0')).length - 1, 1);
  await menu.run(context(['ai', '6']));
  assert.match(sent.text, /INVALID PAGE/);
});
test('export and help remain available', async () => {
  await menu.run(context(['all']));
  assert.equal(sent.fileName, 'menu.txt');
  assert.doesNotMatch(sent.document.toString(), /secret/);
  await menu.run(context(['command000'], 'help'));
  assert.match(sent.text, /Usage: \.command000/);
});
