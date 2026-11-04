'use strict';
const config = require('../../config');
const { clean } = require('../../lib/owner');
const { send } = require('../../lib/event-images');

// 35 command rows + title, borders and navigation = at most 40 lines.
const PAGE_SIZE = 70;
const MAX_CAPTION = 900;
const TITLE_LIMIT = 36;
const oneLine = (value, fallback = '') => String(value || fallback).replace(/[\r\n\t]+/g, ' ').trim().slice(0, TITLE_LIMIT);
const uptime = seconds => {
  const n = Math.floor(seconds);
  const d = Math.floor(n / 86400), h = Math.floor(n % 86400 / 3600), m = Math.floor(n % 3600 / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
};
const border = title => ['┌─❖', `│ ${title}`, '└┬❖'];
const close = lines => [...lines, '└───────❖'].join('\n');
const mono = text => '```' + text + '```';

function inventory(commands) {
  const groups = new Map();
  for (const command of new Set(commands.values())) {
    if (command.ownerOnly || typeof command.name !== 'string') continue;
    const category = String(command.category || 'other').trim().toLowerCase() || 'other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(command);
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
function label() {
  const bot = oneLine(config.botName, 'Ruthless');
  const tagline = oneLine(config.tagline, bot);
  return tagline === bot ? bot : `${bot} · ${tagline}`;
}
function listCategories(groups, prefix) {
  return [...groups].map(([name, commands]) => `│ ➤ ${prefix}menu ${name} (${commands.length})`);
}
function compactCategories(groups, prefix) {
  const entries = [...groups].map(([name, commands]) => `${prefix}menu ${name} (${commands.length})`);
  const lines = [];
  for (let i = 0; i < entries.length; i += 2) lines.push(`│ ➤ ${entries[i]}${entries[i + 1] ? `  ·  ${entries[i + 1]}` : ''}`);
  return lines;
}
function overview(groups, sender, prefix, seconds) {
  const count = [...groups.values()].reduce((sum, commands) => sum + commands.length, 0);
  const lines = border(label());
  lines.push(`│ ➤ @${clean(sender)}`);
  lines.push(`│ ➤ ${prefix} | ${uptime(seconds)} | Commands: ${count}`);
  lines.push('│ ➤ CATEGORIES');
  lines.push(...compactCategories(groups, prefix));
  return close(lines);
}
function commandRows(commands, prefix) {
  const names = commands.map(command => prefix + command.name);
  const width = Math.max(...names.map(name => name.length));
  const rows = [];
  for (let i = 0; i < names.length; i += 2) {
    const pair = names[i + 1] ? `${names[i].padEnd(width)}  ${names[i + 1]}` : names[i];
    rows.push(`│ ➤ ${pair}`);
  }
  return rows;
}
function pagesFor(category, commands, prefix) {
  const pages = [];
  let current = [];
  for (let i = 0; i < commands.length; i += 2) {
    const pair = commands.slice(i, i + 2), next = [...current, ...pair];
    const reserve = `│ ➤ 9999/9999 · ${prefix}menu ${category} 9999`;
    const preview = mono(close([...border(`${category.toUpperCase()} (${commands.length})`), ...commandRows(next, prefix), reserve]));
    if (current.length && (next.length > PAGE_SIZE || preview.length > MAX_CAPTION)) {
      pages.push(current); current = pair;
    } else current = next;
  }
  if (current.length) pages.push(current);
  return pages;
}
function categoryPage(category, commands, pages, page, prefix) {
  const lines = [...border(`${category.toUpperCase()} (${commands.length})`), ...commandRows(pages[page - 1], prefix)];
  if (pages.length > 1) {
    const next = page < pages.length ? `${prefix}menu ${category} ${page + 1}` : `${prefix}menu ${category} 1`;
    lines.push(`│ ➤ ${page}/${pages.length} · ${next}`);
  }
  return mono(close(lines));
}
function exportMenu(groups, prefix) {
  const lines = border(`${label()} · ALL COMMANDS`);
  for (const [category, commands] of groups) {
    lines.push(`│ ➤ ${category.toUpperCase()} (${commands.length})`);
    for (const command of commands) {
      const aliases = (command.aliases || []).map(alias => prefix + alias);
      lines.push(`│ ➤ ${prefix}${command.name}${aliases.length ? ` (${aliases.join(', ')})` : ''}`);
    }
  }
  return Buffer.from(close(lines) + '\n', 'utf8');
}
async function sendText(ctx, text, mentions = []) {
  await ctx.sock.sendMessage(ctx.chat, { text, mentions }, { quoted: ctx.msg });
  ctx.markReplied();
}
async function sendBanner(ctx, text, mentions = []) {
  await send({ sock: ctx.sock, db: ctx.db, chat: ctx.chat, event: 'menu', user: ctx.sender, text, mentions, quoted: ctx.msg });
  ctx.markReplied();
}
module.exports = {
  name: 'menu', aliases: ['help', 'list', 'commands', 'allmenu'], category: 'general',
  description: 'Browse command categories, get command help or export the full menu.',
  usage: 'menu [category] [page] | menu all | help <command>',
  ownerOnly: false, adminOnly: false, groupOnly: false, cooldown: 0,
  async run(ctx) {
    const groups = inventory(ctx.commands), prefix = config.prefix;
    const query = String(ctx.args[0] || '').replace(prefix, '').toLowerCase();
    if (!query && ctx.args.length === 0) {
      return sendBanner(ctx, overview(groups, ctx.sender, prefix, process.uptime()), [ctx.sender]);
    }
    if (query === 'all' && ctx.args.length === 1) {
      const document = exportMenu(groups, prefix);
      await ctx.sock.sendMessage(ctx.chat, { document, mimetype: 'text/plain', fileName: 'menu.txt' }, { quoted: ctx.msg });
      ctx.markReplied();
      return;
    }
    // Preserve .help <command>, including command aliases, separately from .menu <category>.
    if (ctx.invoked === 'help' && ctx.args.length === 1) {
      const command = ctx.commands.get(query);
      if (!command || command.ownerOnly) return sendText(ctx, close([...border('COMMAND HELP'), '│ ➤ Command not found.']));
      const aliases = (command.aliases || []).map(alias => prefix + alias).join(', ') || 'none';
      return sendText(ctx, close([...border('COMMAND HELP'), `│ ➤ ${prefix}${command.name}`, `│ ➤ ${command.description}`, `│ ➤ Usage: ${prefix}${command.usage}`, `│ ➤ Aliases: ${aliases}`]));
    }
    const commands = groups.get(query);
    if (!commands) return sendText(ctx, close([...border('UNKNOWN CATEGORY'), '│ ➤ Valid categories:', ...listCategories(groups, prefix)]));
    const pageText = ctx.args[1] || '1', pages = pagesFor(query, commands, prefix);
    if (ctx.args.length > 2 || !/^[1-9]\d*$/.test(pageText) || !Number.isSafeInteger(Number(pageText)) || Number(pageText) > pages.length) {
      return sendText(ctx, close([...border('INVALID PAGE'), `│ ➤ Use ${prefix}menu ${query} 1-${pages.length}.`]));
    }
    return sendBanner(ctx, categoryPage(query, commands, pages, Number(pageText), prefix));
  }
};
