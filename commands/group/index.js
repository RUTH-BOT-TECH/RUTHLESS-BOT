const config = require('../../config');
const { target, context, inner, matchParticipant, groupContext, safeTarget, okResult, sendMention, downloadMediaMessage } = require('../../lib/group');
const { clean, phoneJid } = require('../../lib/owner');
const defaults = { category: 'group', ownerOnly: false, adminOnly: true, groupOnly: true, cooldown: 0 };
const cmd = (name, aliases, description, usage, run, extra = {}) => ({ ...defaults, name, aliases, description, usage, run, ...extra });
const publicCmd = { adminOnly: false };
const usage = (ctx, u, e) => ctx.reply(`⚠️ Usage: ${config.prefix}${u}\nExample: ${config.prefix}${e}`);
const groupKey = (chat, name) => `group:${chat}:${name}`;
const view = jid => '@' + clean(jid);
async function action(ctx, operation) {
  const state = await groupContext(ctx, { botAdmin: true }); if (!state) return;
  ctx.usage = `${config.prefix}${operation} <number|@mention|reply>`; ctx.example = `${config.prefix}${operation} 2348012345678`;
  const requested = await target(ctx); const id = await safeTarget(ctx, state.meta, requested, { allowAbsent: operation === 'add' }); if (!id) return;
  const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, [id], operation === 'kick' ? 'remove' : operation);
  if (!okResult(result)) {
    if (operation === 'add') {
      try { const link = await ctx.sock.groupInviteCode(ctx.chat); return ctx.reply(`⚠️ Add failed or privacy blocked it. Invite link: https://chat.whatsapp.com/${link}`); }
      catch { return ctx.reply('⚠️ Add failed; an invite link could not be created.'); }
    }
    return ctx.reply('⚠️ WhatsApp rejected the group action.');
  }
  await sendMention(ctx, `✅ ${operation}: ${view(id)}`, [id]);
}
const commands = [
  ...[['add',[]],['kick',['remove']],['promote',[]],['demote',[]]].map(([n,a]) => cmd(n,a,`${n} a group member.`,`${n} <number|@mention|reply>`, ctx => action(ctx,n))),
  ...[['ban', true], ['unban', false]].map(([n, val]) => cmd(n, [], `${n} a member from bot commands in this group.`, `${n} <number|@mention|reply>`, async ctx => {
    const state = await groupContext(ctx); if (!state) return;
    ctx.usage = `${config.prefix}${n} <number|@mention|reply>`; ctx.example = `${config.prefix}${n} 2348012345678`;
    const id = await safeTarget(ctx, state.meta, await target(ctx)); if (!id) return;
    const member = matchParticipant(state.meta.participants,id);
    const canonical = await phoneJid(ctx.sock,id,member?.phoneNumber) || id;
    await ctx.db.set(groupKey(ctx.chat, `ban:${canonical}`), val); await sendMention(ctx, `✅ ${view(id)} ${val ? 'banned from' : 'allowed to use'} bot commands in this group.`, [id]);
  })),
  ...[['mute',['close'],'announcement'],['unmute',['open'],'not_announcement'],['lock',[],'locked'],['unlock',[],'unlocked']].map(([n, aliases, setting]) => cmd(n, aliases, `${n} the group.`, n, async ctx => {
    if (!await groupContext(ctx,{botAdmin:true})) return;
    await ctx.sock.groupSettingUpdate(ctx.chat, setting); await ctx.reply(`✅ Group ${n} setting applied.`);
  })),
  ...[['announce',[]],['tagall',[]],['hidetag',[]],['tagadmins',['admins','listadmins']]].map(([n, aliases]) => cmd(n,aliases,`Mention ${n === 'tagadmins' ? 'group admins' : 'group members'}.`,`${n} [text]`, async ctx => {
    const state = await groupContext(ctx); if (!state) return;
    const people = state.meta.participants.filter(p => n !== 'tagadmins' || p.admin).map(p => p.id);
    const text = ctx.args.join(' ').trim();
    if (n === 'hidetag' && !text && context(ctx.msg).quotedMessage) {
      const info = context(ctx.msg); const quoted = { key: { remoteJid: ctx.chat, id: info.stanzaId, participant: info.participant }, message: info.quotedMessage };
      await ctx.sock.sendMessage(ctx.chat, { forward: quoted, mentions: people }); ctx.markReplied(); return;
    }
    const visible = n === 'tagall' || n === 'tagadmins';
    if (!visible && !text) return usage(ctx, `${n} <text>`, `${n} Hello everyone`);
    await sendMention(ctx, `${text || '👥 Members'}${visible ? '\n' + people.map(view).join('\n') : ''}`, people);
  })),
  cmd('tag', [], 'Mention a replied user or typed numbers.', 'tag <number|reply>', async ctx => {
    const info = context(ctx.msg); const ids = info.participant ? [info.participant] : ctx.args.filter(x => /^\+?\d{6,15}$/.test(x)).map(x => `${x.replace(/\D/g,'')}@s.whatsapp.net`);
    if (!ids.length) return usage(ctx, 'tag <number|reply>', 'tag 2348012345678');
    await sendMention(ctx, ids.map(view).join(' '), ids);
  }),
  ...[['warn', 'add'], ['unwarn', 'remove'], ['resetwarn', 'reset'], ['warnings', 'show']].map(([n, op]) => cmd(n, [], `${n} a group member.`, `${n} <number|@mention|reply>`, async ctx => {
    const state = await groupContext(ctx, { botAdmin: op === 'add' }); if (!state) return;
    ctx.usage = `${config.prefix}${n} <number|@mention|reply>`; ctx.example = `${config.prefix}${n} 2348012345678`;
    const id = await safeTarget(ctx, state.meta, await target(ctx)); if (!id) return;
    const member = matchParticipant(state.meta.participants,id);
    const canonical = await phoneJid(ctx.sock,id,member?.phoneNumber) || id;
    const key = `warn:${ctx.chat}:${canonical}`; const old = await ctx.db.get(key, 0);
    const count = op === 'add' ? old+1 : op === 'remove' ? Math.max(0,old-1) : op === 'reset' ? 0 : old;
    if (op === 'add' && count >= 3) {
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, [id], 'remove');
      if (!okResult(result)) { await ctx.db.set(key, count); return ctx.reply('⚠️ Third warning saved, but WhatsApp rejected the kick.'); }
      await ctx.db.set(key, 0); return sendMention(ctx, `⚠️ ${view(id)} reached 3 warnings and was removed; warnings reset.`, [id]);
    }
    if (op !== 'show') await ctx.db.set(key,count);
    const reason = op === 'add' ? ctx.args.filter(x => !/^\+?\d{6,15}$/.test(x) && !x.startsWith('@')).join(' ') : '';
    await sendMention(ctx, `⚠️ ${view(id)}: ${count} warning(s)${reason ? `\nReason: ${reason}` : ''}`, [id]);
  })),
  cmd('listwarn', [], 'List group warnings.', 'listwarn', async ctx => {
    const rows = (await ctx.db.list(`warn:${ctx.chat}:`)).filter(([,v]) => Number(v)>0);
    if (!rows.length) return ctx.reply('✅ No active warnings.');
    const ids = rows.map(([key]) => key.slice(`warn:${ctx.chat}:`.length)); await sendMention(ctx, rows.map(([,v],i) => `${view(ids[i])}: ${v}`).join('\n'), ids);
  }),
  cmd('groupinfo', [], 'Show group details.', 'groupinfo', async ctx => {
    const m = await ctx.sock.groupMetadata(ctx.chat); const admins = m.participants.filter(x => x.admin).length;
    const text = `👥 ${m.subject}\nDescription: ${m.desc || 'None'}\nCreator: ${m.owner || 'Unknown'}\nMembers: ${m.participants.length}\nAdmins: ${admins}\nCreated: ${m.creation ? new Date(m.creation*1000).toISOString().slice(0,10) : 'Unknown'}`;
    try { const url = await ctx.sock.profilePictureUrl(ctx.chat, 'image'); if (!url) throw Error(); await ctx.sock.sendMessage(ctx.chat,{image:{url},caption:ctx.box(text)},{quoted:ctx.msg}); ctx.markReplied(); }
    catch { try { const image=await require('node:fs/promises').readFile(require('node:path').join(__dirname,'../../assets/default-pfp.jpg'));await ctx.sock.sendMessage(ctx.chat,{image,caption:ctx.box(`${text}\nUsing default group picture.`)},{quoted:ctx.msg});ctx.markReplied(); }catch{await ctx.reply(`${text}\nGroup picture unavailable.`);} }
  }, publicCmd),
  cmd('grouplink', [], 'Get the group invite link.', 'grouplink', async ctx => { if (!await groupContext(ctx,{botAdmin:true})) return; await ctx.reply(`🔗 https://chat.whatsapp.com/${await ctx.sock.groupInviteCode(ctx.chat)}`); }),
  cmd('revoke', ['resetlink'], 'Reset the group invite link.', 'revoke', async ctx => { if (!await groupContext(ctx,{botAdmin:true})) return; await ctx.reply(`✅ New invite: https://chat.whatsapp.com/${await ctx.sock.groupRevokeInvite(ctx.chat)}`); }),
  ...[['setname','groupUpdateSubject'],['setdesc','groupUpdateDescription']].map(([n,method]) => cmd(n, [], `Change group ${n === 'setname' ? 'name' : 'description'}.`, `${n} <text>`, async ctx => {
    if (!await groupContext(ctx,{botAdmin:true})) return; const text = ctx.args.join(' ').trim(); if (!text) return usage(ctx,`${n} <text>`,`${n} My group`);
    await ctx.sock[method](ctx.chat,text); await ctx.reply('✅ Group updated.');
  })),
  cmd('setpp', [], 'Set the group picture from a replied image.', 'setpp <reply to image>', async ctx => {
    if (!await groupContext(ctx,{botAdmin:true})) return;
    const info = context(ctx.msg), q = info.quotedMessage;
    if (!q || !inner(q).imageMessage) return usage(ctx,'setpp <reply to image>','setpp (reply to an image)');
    if (Number(inner(q).imageMessage.fileLength || 0) > 50*1024*1024) return ctx.reply('⚠️ Media exceeds the 50 MB limit.');

    const quoted = { key: { remoteJid: ctx.chat, id: info.stanzaId, participant: info.participant }, message: q };
    let data;
    try { data=await require('../../lib/media').download(ctx.sock,quoted); }
    catch(e) { if(e.message.includes('50 MB')) return ctx.reply('⚠️ Media exceeds the 50 MB limit.'); throw e; }
    await ctx.sock.updateProfilePicture(ctx.chat, data); await ctx.reply('✅ Group picture updated.');
  }),
  cmd('delpp', [], 'Delete the group picture.', 'delpp', async ctx => { if (!await groupContext(ctx,{botAdmin:true})) return; await ctx.sock.removeProfilePicture(ctx.chat); await ctx.reply('✅ Group picture removed.'); }),
  cmd('slowmode', [], 'Set bot-side slowmode in seconds or off.', 'slowmode <seconds|off>', async ctx => {
    if (!await groupContext(ctx,{botAdmin:true})) return;
    const v = ctx.args[0]; if (!v) return ctx.reply(`⏱️ Slowmode: ${(await ctx.db.get(groupKey(ctx.chat,'slowmode'), 0)) || 'off'} seconds.`);
    if (ctx.args.length !== 1 || (v !== 'off' && (!/^\d+$/.test(v) || Number(v)<1 || Number(v)>3600))) return usage(ctx, 'slowmode <1-3600|off>', 'slowmode 10');
    const seconds = v === 'off' ? 0 : Number(v); await ctx.db.set(groupKey(ctx.chat,'slowmode'),seconds); await ctx.reply(`✅ Slowmode ${seconds ? `set to ${seconds} seconds` : 'off'}. Bot admin required for enforcement.`);
  }),
  cmd('poll', [], 'Create a native WhatsApp poll.', 'poll question | option1 | option2', async ctx => {
    const pieces = ctx.args.join(' ').split('|').map(x=>x.trim()).filter(Boolean);
    if (pieces.length < 3 || pieces.length > 13) return usage(ctx,'poll question | option1 | option2','poll Best day? | Monday | Friday');
    await ctx.sock.sendMessage(ctx.chat,{poll:{name:pieces[0],values:pieces.slice(1),selectableCount:1}},{quoted:ctx.msg}); ctx.markReplied();
  }, publicCmd),
  cmd('vote', [], 'Start or vote in a bot-run vote.', 'vote question | option1 | option2 OR vote <number>', async ctx => {
    const key = groupKey(ctx.chat,'vote'); let game = await ctx.db.get(key,null);
    if (ctx.args.length === 1 && /^\d+$/.test(ctx.args[0])) {
      if (!game) return ctx.reply('⚠️ No active vote.'); const n = Number(ctx.args[0]); if (n < 1 || n > game.options.length) return ctx.reply('⚠️ Invalid option number.');
      game.votes[ctx.sender] = n; await ctx.db.set(key,game); return ctx.reply(`✅ Your vote for ${game.options[n-1]} is saved.`);
    }
    if (!await groupContext(ctx)) return;
    if (game) return ctx.reply('⚠️ A vote is already active. Use .endvote first.');
    const parts = ctx.args.join(' ').split('|').map(x=>x.trim()).filter(Boolean); if (parts.length < 3 || parts.length > 13) return usage(ctx,'vote question | option1 | option2','vote Best day? | Monday | Friday');
    game={question:parts[0],options:parts.slice(1),votes:{}}; await ctx.db.set(key,game);
    await ctx.reply(`🗳️ ${game.question}\n${game.options.map((x,i)=>`${i+1}. ${x}`).join('\n')}\nVote with ${config.prefix}vote <number>.`);
  }, publicCmd),
  cmd('endvote', [], 'End the active bot-run vote.', 'endvote', async ctx => {
    const key = groupKey(ctx.chat,'vote'); const game = await ctx.db.get(key,null); if (!game) return ctx.reply('⚠️ No active vote.');
    await ctx.db.del(key); const values = Object.values(game.votes); await ctx.reply(`🗳️ Results: ${game.question}\n${game.options.map((v,i)=>`${i+1}. ${v}: ${values.filter(x=>x===i+1).length}`).join('\n')}`);
  })
];
module.exports = commands;

for (const name of ['welcome','goodbye']) {
  commands.push(cmd(name, [], `Enable or disable ${name} messages.`, `${name} on|off`, async ctx => {
    const key = groupKey(ctx.chat,name); const value = ctx.args[0];
    if (!value) return ctx.reply(`ℹ️ ${name}: ${(await ctx.db.get(key,false)) ? 'on' : 'off'}.`);
    if (ctx.args.length !== 1 || !['on','off'].includes(value)) return usage(ctx,`${name} on|off`,`${name} on`);
    await ctx.db.set(key,value==='on'); await ctx.reply(`✅ ${name} ${value}.`);
  }));
  commands.push(cmd(`set${name}`, [], `Set the ${name} message.`, `set${name} <template>`, async ctx => {
    const value = ctx.args.join(' ').trim(); if (!value) return usage(ctx,`set${name} <template>`,`set${name} Hello {user}, welcome to {group}!`);
    if (value.length > 1000) return ctx.reply('⚠️ Template is limited to 1000 characters.');
    await ctx.db.set(groupKey(ctx.chat,`${name}:template`),value); await ctx.reply(`✅ ${name} template saved. Placeholders: {user}, {group}, {count}.`);
  }));
}
for (const name of ['autoread','autoreact','autotyping','autorecord','autodl']) {
  commands.push(cmd(name, [], `Toggle global ${name}.`, `${name} on|off`, async ctx => {
    const key = 'settings:global', settings = await ctx.db.get(key,{}), value = ctx.args[0];
    if (!value) return ctx.reply(`ℹ️ ${name}: ${settings[name] ? 'on' : 'off'}.`);
    if (ctx.args.length !== 1 || !['on','off'].includes(value)) return usage(ctx,`${name} on|off`,`${name} on`);
    settings[name] = value === 'on';
    if (settings[name] && name === 'autotyping') settings.autorecord = false;
    if (settings[name] && name === 'autorecord') settings.autotyping = false;
    await ctx.db.set(key,settings); await ctx.reply(`✅ ${name} ${value}.${settings[name] && ['autotyping','autorecord'].includes(name) ? ' The other presence mode is off.' : ''}${name==='autodl' ? ' Supported: public GitHub repositories and sites listed in the downloader menu. Results depend on site access.' : ''}`);
  }, { category:'owner', ownerOnly:true, adminOnly:false, groupOnly:false }));
}
const protections = ['antilink','antispam','antibadword','antitoxic','antiflood','antitag','antimention','antichannel','antiforward','antimedia','antisticker','antiimage','antivideo','antiaudio','antidoc','antilongtext'];
for (const name of protections) commands.push(cmd(name, [], `Configure ${name} protection.`, `${name} on|off|delete|warn|kick`, async ctx => {
  const key = groupKey(ctx.chat,`protection:${name}`); const mode = ctx.args[0];
  if (!mode) return ctx.reply(`🛡️ ${name}: ${await ctx.db.get(key,'off')}.`);
  if (ctx.args.length !== 1 || !['on','off','delete','warn','kick'].includes(mode)) return usage(ctx,`${name} on|off|delete|warn|kick`,`${name} delete`);
  if (mode !== 'off' && !await groupContext(ctx,{botAdmin:true})) return;
  const value = mode === 'on' ? 'delete' : mode; await ctx.db.set(key,value); await ctx.reply(`✅ ${name}: ${value}.`);
}));
for (const [name, remove] of [['addbadword',false], ['delbadword',true]]) commands.push(cmd(name, [], 'Edit this group’s blocked-word list.', `${name} <word>`, async ctx => {
  const word = ctx.args.join(' ').trim().toLowerCase(); if (!word || word.length>100) return usage(ctx,`${name} <word>`,`${name} example`);
  const key=groupKey(ctx.chat,'badwords'), words=await ctx.db.get(key,[]); const next=remove ? words.filter(x=>x!==word) : [...new Set([...words,word])];
  await ctx.db.set(key,next); await ctx.reply(`✅ ${remove ? 'Removed' : 'Added'} blocked phrase: ${word}`);
}));

for (const name of ['antidelete','antiviewonce','antifake']) commands.push(cmd(name, [], `Toggle ${name}.`, `${name} on|off`, async ctx => {
  const key = groupKey(ctx.chat,`protection:${name}`), mode=ctx.args[0];
  if (!mode) return ctx.reply(`🛡️ ${name}: ${await ctx.db.get(key,'off')}.`);
  if (ctx.args.length!==1 || !['on','off'].includes(mode)) return usage(ctx,`${name} on|off`,`${name} on`);
  if (mode==='on' && name==='antifake' && !(await ctx.db.get(groupKey(ctx.chat,'allowedcodes'),[])).length) return ctx.reply(`⚠️ Set allowed phone prefixes first with ${config.prefix}allowcountry add 234.`);
  if (mode==='on' && name==='antifake' && !await groupContext(ctx,{botAdmin:true})) return;
  await ctx.db.set(key,mode); await ctx.reply(`✅ ${name}: ${mode}.`);
}));
commands.push(cmd('allowcountry', [], 'Manage allowed international phone prefixes for antifake.', 'allowcountry add|del <digits> OR list', async ctx => {
  const [op, prefix] = ctx.args, key=groupKey(ctx.chat,'allowedcodes'), list=await ctx.db.get(key,[]);
  if (op==='list' && ctx.args.length===1) return ctx.reply(`🌍 Allowed phone prefixes: ${list.join(', ') || 'none'}`);
  if (!['add','del'].includes(op) || ctx.args.length!==2 || !/^[1-9]\d{0,3}$/.test(prefix || '')) return usage(ctx,'allowcountry add|del <digits> OR list','allowcountry add 234');
  const result=op==='add' ? [...new Set([...list,prefix])] : list.filter(x=>x!==prefix);
  if (!result.length && await ctx.db.get(groupKey(ctx.chat,'protection:antifake'),'off')==='on') return ctx.reply('⚠️ Turn antifake off before removing the last allowed prefix.');
  await ctx.db.set(key,result); await ctx.reply(`✅ Allowed phone prefixes: ${result.join(', ') || 'none'}.`);
}));
commands.push(cmd('botprefix', [], 'Manage bot message-ID prefixes for antibot detection.', 'botprefix add|del <prefix> OR list', async ctx => {
  const [op,prefixRaw]=ctx.args, key=groupKey(ctx.chat,'botprefixes'), list=await ctx.db.get(key,[]), prefix=(prefixRaw||'').toUpperCase();
  if (op==='list' && ctx.args.length===1) return ctx.reply(`🤖 Bot-ID prefixes: ${list.join(', ') || 'none'}. Detection is heuristic and can be wrong.`);
  if (!['add','del'].includes(op) || ctx.args.length!==2 || !/^[A-Z0-9]{4,20}$/.test(prefix)) return usage(ctx,'botprefix add|del <4-20 letters or digits>','botprefix add BAE5');
  const updated=op==='add' ? [...new Set([...list,prefix])] : list.filter(x=>x!==prefix);
  await ctx.db.set(key,updated); await ctx.reply(`✅ Bot-ID prefixes: ${updated.join(', ') || 'none'}. Detection can be wrong.`);
}));
for (const name of ['antibot','antistatus','antiporn']) commands.push(cmd(name, [], `Configure ${name} protection.`, `${name} on|off|delete|warn|kick`, async ctx => {
  const key=groupKey(ctx.chat,`protection:${name}`),mode=ctx.args[0];
  if (!mode) return ctx.reply(`🛡️ ${name}: ${await ctx.db.get(key,'off')}.`);
  if (ctx.args.length!==1 || !['on','off','delete','warn','kick'].includes(mode)) return usage(ctx,`${name} on|off|delete|warn|kick`,`${name} delete`);
  if (mode!=='off' && !await groupContext(ctx,{botAdmin:true})) return;
  if (mode!=='off' && name==='antibot' && !(await ctx.db.get(groupKey(ctx.chat,'botprefixes'),[])).length) return ctx.reply(`⚠️ Configure bot message-ID prefixes first with ${config.prefix}botprefix add <prefix>. These heuristics can misidentify users.`);
  if (mode!=='off' && name==='antiporn') {
    try { await require('../../lib/nsfw-queue').ready(); } catch { return ctx.reply('⚠️ Local image model could not start; antiporn remains unchanged.'); }
  }
  await ctx.db.set(key,mode==='on'?'delete':mode);
  await ctx.reply(`✅ ${name}: ${mode==='on'?'delete':mode}.${name==='antiporn'?' Image scanning is probabilistic and may miss content.':''}`);
}));

commands.push(cmd('eventimg', [], 'Enable or disable menu, welcome and goodbye images for this group.', 'eventimg on|off', async ctx => {
 const key=groupKey(ctx.chat,'eventimg'),mode=ctx.args[0];if(!mode)return ctx.reply(`ℹ️ eventimg: ${(await ctx.db.get(key,true))?'on':'off'}.`);
 if(ctx.args.length!==1||!['on','off'].includes(mode))return usage(ctx,'eventimg on|off','eventimg off');await ctx.db.set(key,mode==='on');await ctx.reply(`✅ Event images ${mode}.`);
}));
