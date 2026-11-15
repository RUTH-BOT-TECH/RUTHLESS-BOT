'use strict';
const config = require('../../config');
const { clean } = require('../../lib/owner');
const { send } = require('../../lib/event-images');
const botMode = require('../../lib/bot-mode');
const { version } = require('../../package.json');

// 35 command rows + title, border and navigation = at most 39 lines.
const PAGE_SIZE = 35;
const MAX_CAPTION = 900;
const TITLE_LIMIT = 36;
const oneLine = (value, fallback = '') => String(value || fallback).replace(/[\r\n\t]+/g, ' ').trim().slice(0, TITLE_LIMIT);
const uptime = seconds => {
  const n = Math.floor(seconds);
  const d = Math.floor(n / 86400), h = Math.floor(n % 86400 / 3600), m = Math.floor(n % 3600 / 60);
  const s = n % 60;
  return d ? `${d}d ${h}h ${m}m ${s}s` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
};
const border = title => ['┌─❖', `│ ${title}`, '└┬❖'];
const close = lines => [...lines, '└───────❖'].join('\n');

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
  return [...groups].map(([name, commands]) => `┣◆ ${prefix}menu ${name} (${commands.length})`);
}
function hostName(env = process.env) {
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) return 'Railway';
  if (env.RENDER) return 'Render';
  if (env.DYNO) return 'Heroku';
  return 'Other / local';
}
function overview(groups, sender, prefix, seconds, mode) {
  const count = [...groups.values()].reduce((sum, commands) => sum + commands.length, 0);
  const bot = oneLine(config.botName, 'Ruthless');
  const owner = oneLine(process.env.BOT_OWNER_NAME, 'Not set');
  return [
    `┏❐  *◈ ${bot} ◈*`,
    `┃ *Owner* : ${owner}`,
    `┃ *Mode* : ${mode}`,
    `┃ *Host* : ${hostName()}`,
    `┃ *Prefix* : [${prefix}]`,
    `┃ *Uptime* : ${uptime(seconds)}`,
    `┃ *Version* : ${version}`,
    `┃ *Commands* : ${count}`,
    `┃ *User* : @${clean(sender)}`,
    '┗❐',
    '',
    '┏❐ 《 *COMMAND CATEGORIES* 》 ❐',
    ...listCategories(groups, prefix),
    '┗❐',
    `➤ ${prefix}menu <category> · ${prefix}menu all`,
    `➤ ${prefix}help <command>`
  ].join('\n');
}
function commandRows(commands, prefix) {
  return commands.map(command => `┣◆ ${prefix}${command.name}`);
}
function renderCategory(category, commands, pageCommands, prefix, navigation = '') {
  const lines = [`┏❐ 《 *${oneLine(category).toUpperCase()} MENU* 》 ❐`,
    `┃ ${commands.length} commands`, ...commandRows(pageCommands, prefix)];
  if (navigation) lines.push(`┃ ${navigation}`);
  return [...lines, '┗❐'].join('\n');
}
function pagesFor(category, commands, prefix) {
  const pages = [];
  let current = [];
  for (const command of commands) {
    const next = [...current, command];
    const reserve = `9999/9999 · ${prefix}menu ${category} 9999`;
    const preview = renderCategory(category, commands, next, prefix, reserve);
    if (current.length && (next.length > PAGE_SIZE || preview.length > MAX_CAPTION)) {
      pages.push(current); current = [command];
    } else current = next;
  }
  if (current.length) pages.push(current);
  return pages;
}
function categoryPage(category, commands, pages, page, prefix) {
  const next = page < pages.length ? `${prefix}menu ${category} ${page + 1}` : `${prefix}menu ${category} 1`;
  return renderCategory(category, commands, pages[page - 1], prefix, pages.length > 1 ? `${page}/${pages.length} · ${next}` : '');
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
  name: 'menu', aliases: ['help', 'list', 'commands', 'allmenu', 'start'], category: 'general',
  description: 'Browse command categories, get command help or export the full menu.',
  usage: 'menu [category] [page] | menu all | help <command>',
  ownerOnly: false, adminOnly: false, groupOnly: false, cooldown: 0,
  async run(ctx) {
    const groups = inventory(ctx.commands), prefix = config.prefix;
    const query = String(ctx.args[0] || '').replace(prefix, '').toLowerCase();
    if (!query && ctx.args.length === 0) {
      return sendBanner(ctx, overview(groups, ctx.sender, prefix, process.uptime(), await botMode.current(ctx.db)), [ctx.sender]);
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
      if (!command || (command.ownerOnly && !ctx.owner)) return sendText(ctx, close([...border('COMMAND HELP'), '│ ➤ Command not found.']));
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
