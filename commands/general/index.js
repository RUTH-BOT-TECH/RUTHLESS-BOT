const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../../config');
const { clean } = require('../../lib/owner');
const { version } = require('../../package.json');
const root = path.join(__dirname, '../..');
const defaults = { category: 'general', ownerOnly: false, adminOnly: false, groupOnly: false, cooldown: 0 };
const cmd = (name, aliases, description, usage, run, extra = {}) => ({ ...defaults, name, aliases, description, usage, run, ...extra });
const usage = (ctx, text, example) => ctx.reply(`⚠️ Usage: ${config.prefix}${text}\nExample: ${config.prefix}${example}`);
const elapsed = seconds => `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Ruthless-MD/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json();
}
function timezone(args) { const tz = args.join(' ') || config.timezone; try { new Intl.DateTimeFormat('en', { timeZone: tz }).format(); return tz; } catch { return null; } }
function githubRepo() {
  try { const u = new URL(config.repoUrl); const parts = u.pathname.split('/').filter(Boolean); if (u.hostname !== 'github.com' || parts.length !== 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+$/.test(parts[1])) return null; return parts.map(encodeURIComponent).join('/').replace(/\.git$/, ''); } catch { return null; }
}
const commands = [
  cmd('ping', ['speed'], 'Measure the response time.', 'ping', async ctx => {
    const start = Date.now(); await ctx.reply('🏓 Measuring…'); await ctx.reply(`🏓 Send acknowledgement time: ${Date.now() - start} ms.`);
  }),
  cmd('runtime', ['uptime'], 'Show bot uptime.', 'runtime', ctx => ctx.reply(`⏱️ Uptime: ${elapsed(process.uptime())}`)),
  cmd('alive', ['status', 'botinfo', 'info', 'about', 'stats'], 'Show bot status.', 'alive', async ctx => {
    const start = Date.now(); let groups = 'unavailable';
    try { groups = Object.keys(await ctx.sock.groupFetchAllParticipating()).length; } catch {}
    const users = (await ctx.db.list('seen:')).length;
    await ctx.reply(`✅ Online\nVersion: ${version}\nUptime: ${elapsed(process.uptime())}\nStatus collection: ${Date.now() - start} ms\nMode: ${config.mode}\nCommands: ${new Set(ctx.commands.values()).size}\nGroups: ${groups}\nUsers observed: ${users}`);
  }),
  cmd('owner', ['creator', 'contact', 'vcard'], 'Show the deployer’s owner contact and creator credit.', 'owner', async ctx => {
    if (!config.ownerNumber) return ctx.reply(`⚠️ OWNER_NUMBER is not configured.\nCreator credit: +${config.creator}`);
    const card = `BEGIN:VCARD\nVERSION:3.0\nFN:Bot Owner\nTEL;type=CELL;type=VOICE;waid=${config.ownerNumber}:+${config.ownerNumber}\nEND:VCARD`;
    await ctx.sock.sendMessage(ctx.chat, { contacts: { displayName: 'Bot Owner', contacts: [{ vcard: card }] } }, { quoted: ctx.msg });
    await ctx.reply(`👤 Deployer: @${config.ownerNumber}\nCreator credit: @${config.creator}`, { mentions: [`${config.ownerNumber}@s.whatsapp.net`, `${config.creator}@s.whatsapp.net`] });
  }),
  cmd('donate', [], 'Show the donation link.', 'donate', ctx => ctx.reply(config.donateUrl ? `💛 Donate: ${config.donateUrl}` : '⚠️ The owner has not configured DONATE_URL.')),
  cmd('script', ['repo'], 'Show the project repository.', 'repo', ctx => ctx.reply(`📦 Repository: ${config.repoUrl || 'Not configured; set REPO_URL.'}\nCreator credit: +${config.creator}`)),
  cmd('report', ['bug', 'feedback', 'request', 'suggest'], 'Send feedback to the owner.', 'report <message>', async ctx => {
    const text = ctx.args.join(' ').trim(); if (!text) return usage(ctx, 'report <message>', 'report Menu does not open');
    if (!config.ownerNumber) return ctx.reply('⚠️ The owner has not configured OWNER_NUMBER.');
    try { await ctx.sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, { text: ctx.box(`📬 ${ctx.invoked} from ${ctx.sender}\n${text.slice(0, 3000)}`) }); await ctx.reply('✅ Sent to the owner.'); }
    catch { await ctx.reply('⚠️ Could not send the report. Please try again later.'); }
  }, { cooldown: 600 }),
  ...['rules', 'faq', 'support', 'tos', 'privacy'].map(n => cmd(n, [], `Show ${n}.`, n, ctx => ctx.reply(`📋 ${n.toUpperCase()}\n${config.texts[n]}`))),
  cmd('invite', ['share', 'mylink', 'botlink'], 'Share the bot’s WhatsApp link.', 'invite', async ctx => {
    const n = clean(ctx.sock.user?.id); if (!/^\d{6,15}$/.test(n)) return ctx.reply('⚠️ Bot phone number is unavailable.');
    return ctx.reply(`🔗 https://wa.me/${n}`);
  }),
  cmd('changelog', ['news'], 'Fetch latest GitHub release notes.', 'changelog', async ctx => {
    const repo = githubRepo(); if (!repo) return ctx.reply('⚠️ Set REPO_URL to a GitHub repository to use this command.');
    try { const r = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`); await ctx.reply(`📰 ${r.name || r.tag_name}\n${(r.body || 'No release notes provided.').slice(0, 2000)}\nSource: GitHub ${r.html_url}`); }
    catch { await ctx.reply('⚠️ Could not fetch release notes from GitHub. Check the repository and try again later.'); }
  }),
  cmd('language', ['setlang'], 'Save your default language for future translation commands.', 'language <code>', async ctx => {
    const lang = ctx.args[0];
    try { if (!lang || ctx.args.length !== 1 || new Intl.Locale(lang).language.length < 2) throw Error(); }
    catch { return usage(ctx, 'language <language-code>', 'language es'); }
    const user = await ctx.db.get(`user:${ctx.sender}`, {}); user.language = new Intl.Locale(lang).toString(); await ctx.db.set(`user:${ctx.sender}`, user);
    await ctx.reply(`🌐 Saved language: ${user.language}. This is for translation commands; the whole bot is not translated.`);
  }),
  cmd('profile', ['me', 'whoami', 'id', 'myid'], 'Show your stored profile.', 'profile', async ctx => {
    const user = await ctx.db.get(`user:${ctx.sender}`, {});
    const warns = ctx.group ? await ctx.db.get(`warn:${ctx.chat}:${ctx.sender}`, 0) : 'group-only';
    const ledger = await ctx.db.get('economy:ledger', {}), account = ledger?.[ctx.sender];
    const xp = Number.isFinite(account?.xp) && account.xp >= 0 ? account.xp : 0;
    const text = `👤 ${ctx.msg.pushName || 'User'}\nID: ${ctx.sender}\nLevel: ${Math.floor(Math.sqrt(xp/100))+1}\nWallet: ${account?.wallet ?? 0} virtual coins\nBank: ${account?.bank ?? 0} virtual coins\nWarnings: ${warns}`;
    try { const url = await ctx.sock.profilePictureUrl(ctx.sender, 'image'); if (!url) throw Error(); await ctx.sock.sendMessage(ctx.chat, { image: { url }, caption: ctx.box(text) }, { quoted: ctx.msg }); ctx.markReplied(); }
    catch { try { const image=await fs.readFile(path.join(root,'assets/default-pfp.jpg')); await ctx.sock.sendMessage(ctx.chat,{image,caption:ctx.box(`${text}\nUsing default profile picture.`)},{quoted:ctx.msg});ctx.markReplied(); } catch { await ctx.reply(`${text}\nProfile picture unavailable.`); } }
  }),
  cmd('rate', ['review'], 'Rate the bot from 1 to 5.', 'rate <1-5>', async ctx => {
    if (ctx.args.length !== 1 || !/^[1-5]$/.test(ctx.args[0])) return usage(ctx, 'rate <1-5>', 'rate 5');
    await ctx.db.set(`rating:${ctx.sender}`, Number(ctx.args[0]));
    const values = (await ctx.db.list('rating:')).map(([, v]) => v).filter(v => Number.isInteger(v) && v >= 1 && v <= 5);
    await ctx.reply(`⭐ Saved: ${ctx.args[0]}/5\nAverage: ${(values.reduce((a,b) => a+b, 0) / values.length).toFixed(2)}/5 (${values.length} ratings)`);
  }),
  cmd('time', ['date', 'today'], 'Show current date and time in a timezone.', 'time [IANA timezone]', async ctx => {
    const tz = timezone(ctx.args); if (!tz) return usage(ctx, 'time [IANA timezone]', 'time Africa/Lagos');
    await ctx.reply(`🕒 ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'medium' }).format(new Date())}\nTimezone: ${tz}`);
  }),
  cmd('calendar', [], 'Show the current month.', 'calendar [IANA timezone]', async ctx => {
    const tz = timezone(ctx.args); if (!tz) return usage(ctx, 'calendar [IANA timezone]', 'calendar Africa/Lagos');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric' }).formatToParts(new Date()).map(p => [p.type, p.value]));
    const y = Number(parts.year), m = Number(parts.month), first = new Date(Date.UTC(y, m-1, 1)).getUTCDay(), count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = Array(first).fill('  ').concat(Array.from({ length: count }, (_,i) => String(i+1).padStart(2, ' '))); const rows = [];
    while (cells.length) rows.push(cells.splice(0,7).join(' '));
    await ctx.reply(`📅 ${y}-${String(m).padStart(2,'0')} (${tz})\n\`\`\`Su Mo Tu We Th Fr Sa\n${rows.join('\n')}\`\`\``);
  }),
  cmd('weather', [], 'Get current weather by city from Open-Meteo.', 'weather <city>', async ctx => {
    const city = ctx.args.join(' ').trim(); if (!city) return usage(ctx, 'weather <city>', 'weather Lagos');
    await ctx.reply('⏳ Checking weather…');
    try {
      const locations = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      const place = locations.results?.[0]; if (!place) return ctx.reply('⚠️ City not found. Try a different name.');
      const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
      if (!data.current) throw Error('Missing current weather'); const c = data.current;
      await ctx.reply(`🌤️ ${place.name}, ${place.country || ''}\nTemperature: ${c.temperature_2m} °C\nHumidity: ${c.relative_humidity_2m}%\nWind: ${c.wind_speed_10m} km/h\nWeather code: ${c.weather_code}\nSource: Open-Meteo`);
    } catch { await ctx.reply('⚠️ Weather is unavailable. Try again later. Source: Open-Meteo.'); }
  })
];
module.exports = commands;
