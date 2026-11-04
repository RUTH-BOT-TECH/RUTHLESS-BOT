const config = require('../config');
const { getText, box } = require('../handler');
const { phoneJid, isOwner } = require('./owner');
const MAX_SIZE=50*1024*1024, active=new Set(), last=new Map();
function parseGithubRepo(value) {
  let u; try { u=new URL(value); } catch { return null; }
  if (u.protocol!=='https:' || u.hostname.toLowerCase()!=='github.com' || u.port || u.username || u.password) return null;
  const path=u.pathname.split('/').filter(Boolean); if (path.length!==2) return null;
  const owner=path[0], repo=path[1].replace(/\.git$/i,'');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo==='.' || repo==='..') return null;
  return { owner, repo, url:`https://github.com/${owner}/${repo}` };
}
function findGithubRepo(text) {
  const urls=text.match(/https:\/\/[^\s<>"']+/ig) || [];
  for (const raw of urls) { const found=parseGithubRepo(raw.replace(/[),.!?;]+$/,'')); if (found) return found; }
  return null;
}
async function downloadGitHub(repo) {
  let url=`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/zipball`;
  const signal=AbortSignal.timeout(30000); let response;
  for (let i=0;i<4;i++) {
    response=await fetch(url,{headers:{'User-Agent':'Ruthless-MD/1.0',Accept:'application/vnd.github+json'},redirect:'manual',signal});
    if (response.status>=300 && response.status<400) {
      const next=new URL(response.headers.get('location'),url);
      if (next.protocol!=='https:' || !['api.github.com','codeload.github.com'].includes(next.hostname) || next.username || next.password || next.port) throw Error('Unsafe redirect');
      url=next.href; continue;
    }
    break;
  }
  if (!response?.ok) throw Error('GitHub download unavailable');
  if (Number(response.headers.get('content-length') || 0)>MAX_SIZE) throw Error('Media exceeds 50 MB');
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size+=chunk.length; if (size>MAX_SIZE) { await response.body.cancel().catch(()=>{}); throw Error('Media exceeds 50 MB'); }
    chunks.push(Buffer.from(chunk));
  }
  const bytes=Buffer.concat(chunks);
  if (bytes.length<4 || bytes.readUInt16LE(0)!==0x4b50) throw Error('GitHub did not return a ZIP file');
  return bytes;
}
async function sendGitHub(sock, chat, msg, repo, reply) {
  await reply('⏳ Downloading GitHub repository…');
  try {
    const data=await downloadGitHub(repo);
    await sock.sendMessage(chat,{document:data,mimetype:'application/zip',fileName:`${repo.repo}.zip`,caption:box(`📦 ${repo.owner}/${repo.repo}\nSize: ${(data.length/1024/1024).toFixed(2)} MB\nSource: GitHub`)},{quoted:msg});
  } catch(e) {
    await reply(e.message==='Media exceeds 50 MB' ? '⚠️ This file is larger than 50 MB.' : '⚠️ Could not download, try another link. Source: GitHub.');
  }
}
async function processAutoDL(sock,msg,db) {
  if (!msg?.message || msg.key?.fromMe || !msg.key?.remoteJid || msg.key.remoteJid==='status@broadcast') return false;
  const text=getText(msg.message).trim(); if (!text || text.startsWith(config.prefix)) return false;
  const chat=msg.key.remoteJid, group=chat.endsWith('@g.us'), sender=group ? msg.key.participant : chat;
  if (!sender) return false;
  const alt=group ? msg.key.participantAlt : msg.key.remoteJidAlt, owner=await isOwner(sock,sender,alt);
  if (config.mode==='self' && !owner) return false;
  const resolved=await phoneJid(sock,sender,alt) || sender;
  if (group && !owner && (await db.get(`group:${chat}:ban:${sender}`,false) || await db.get(`group:${chat}:ban:${resolved}`,false))) return false;
  if (!(await db.get('settings:global',{})).autodl) return false;
  const repo=findGithubRepo(text);
  const downloader=require('../commands/downloaders/media');
  const { validLink }=require('./downloader');
  const publicFiles=require('./public-files');
  const gallery=require('./gallery'), capcut=require('./capcut'), meta=require('./meta-download');
  let match=null, fileMatch=null, special=null;
  if(!repo) for(const raw of (text.match(/https:\/\/[^\s<>"']+/ig)||[])) {
    const candidate=raw.replace(/[),.!?;]+$/,'');
    for(const kind of ['mediafire','gdrive','mega']) if(publicFiles.checkedUrl(candidate,kind)) {fileMatch={kind,url:candidate};break;}
    if(fileMatch)break;
  }
  if(!repo && !fileMatch) for(const raw of (text.match(/https:\/\/[^\s<>"']+/ig)||[])) {
    const candidate=raw.replace(/[),.!?;]+$/,'');
    if(gallery.validTikTokPhoto(candidate)){special={kind:'gallery',url:candidate};break;}
    if(capcut.templateId(candidate)){special={kind:'capcut',url:candidate};break;}
    if(meta.threadsId(candidate)){special={kind:'threads',url:candidate};break;}
    if(meta.storyLink(candidate)){special={kind:'stories',url:meta.storyLink(candidate)};break;}
    if(meta.instagramId(candidate)){special={kind:'instagram',url:candidate};break;}
  }
  if (!repo && !fileMatch && !special) for (const raw of (text.match(/https:\/\/[^\s<>"']+/ig)||[])) {
    const candidate=raw.replace(/[),.!?;]+$/,'');
    for (const [site, info] of Object.entries(downloader.bySite)) if (validLink(candidate,site)) { match={site,info,url:candidate}; break; }
    if(match)break;
  }
  if(!repo && !match && !fileMatch && !special)return false;
  if (active.has(chat) || Date.now()-(last.get(chat)||0)<10000) return false;
  active.add(chat); last.set(chat,Date.now());
  if (last.size>1000) last.delete(last.keys().next().value);
  const reply=message=>sock.sendMessage(chat,{text:box(message)},{quoted:msg});
  try {
    if(repo) await sendGitHub(sock,chat,msg,repo,reply);
    else if(special) {await reply('⏳ Downloading…');const ctx={sock,chat,msg,reply,box,markReplied:()=>{}};if(special.kind==='gallery')await gallery.sendSlides(ctx,special.url);else if(special.kind==='capcut')await capcut.send(ctx,special.url);else await meta.send(ctx,special.url,special.kind,{onNotPhoto:()=>downloader.sendResult(ctx,special.url,'instagram','video')});}
    else if(fileMatch) {await reply('⏳ Downloading…');await publicFiles.sendFile({sock,chat,msg,reply,box,markReplied:()=>{}},fileMatch.url,fileMatch.kind);}
    else {await reply('⏳ Downloading…');await downloader.sendResult({sock,chat,msg,reply,box,markReplied:()=>{}},match.url,match.site,match.info.mode);}
  } finally { active.delete(chat); }
  return true;
}
module.exports={parseGithubRepo,findGithubRepo,downloadGitHub,sendGitHub,processAutoDL,MAX_SIZE};
