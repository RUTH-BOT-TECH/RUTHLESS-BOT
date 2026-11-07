const cheerio=require('cheerio');
const dl=require('../../lib/downloader');
const {sendResult}=require('./media');
const config=require('../../config');
const media=require('../../lib/media');
const base={category:'downloaders',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:10};
const make=(name,aliases,description,usage,run)=>({...base,name,aliases,description,usage,run});
const urlFetch=async(url)=>{const r=await fetch(url,{headers:{'User-Agent':'Ruthless-MD/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw Error('Provider unavailable');if(Number(r.headers.get('content-length')||0)>2*1024*1024)throw Error('Provider response too large');const body=await r.text();if(body.length>2*1024*1024)throw Error('Provider response too large');return body;};
async function itunes(query,limit=5){const url=new URL('https://itunes.apple.com/search');url.search=new URLSearchParams({term:query,media:'music',entity:'song',limit:String(limit)});const data=JSON.parse(await urlFetch(url));return (data.results||[]).filter(x=>x.trackName&&x.artistName);}
async function metadataSpotify(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.port||u.username||u.password)throw Error('Invalid Spotify URL');const m=/^\/track\/([A-Za-z0-9]{22})\/?$/.exec(u.pathname);if(!m)throw Error('Invalid Spotify URL');const $=cheerio.load(await urlFetch(`https://open.spotify.com/track/${m[1]}`));const title=$('meta[property="og:title"]').attr('content'),artist=$('meta[name="music:musician_description"]').attr('content');if(!title||!artist)throw Error('Track metadata unavailable');return {title,artist,source:'Spotify public page'};}
async function metadataDeezer(raw){const u=new URL(raw);if(u.protocol!=='https:'||!(u.hostname==='deezer.com'||u.hostname==='www.deezer.com')||u.port||u.username||u.password)throw Error('Invalid Deezer URL');const m=/\/(?:[a-z]{2}\/)?track\/(\d+)\/?$/.exec(u.pathname);if(!m)throw Error('Invalid Deezer URL');const j=JSON.parse(await urlFetch(`https://api.deezer.com/track/${m[1]}`));if(!j.title||!j.artist?.name)throw Error('Track metadata unavailable');return {title:j.title,artist:j.artist.name,source:'Deezer API'};}
async function sendPreview(ctx,url) {
 const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.itunes.apple.com')||u.port||u.username||u.password)throw Error('Invalid preview');
 const r=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok || Number(r.headers.get('content-length')||0)>5*1024*1024)throw Error('Preview unavailable');
 let size=0,parts=[];for await(const b of r.body){size+=b.length;if(size>5*1024*1024)throw Error('Preview too large');parts.push(Buffer.from(b));}
 const audio=await media.convert(Buffer.concat(parts),'mp3',['-t','30','-vn','-c:a','libmp3lame','-b:a','96k']);
 await ctx.sock.sendMessage(ctx.chat,{audio,mimetype:'audio/mpeg'},{quoted:ctx.msg});ctx.markReplied();
}
async function metadataApple(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='music.apple.com'||u.port||u.username||u.password)throw Error('Invalid Apple Music URL');const id=u.searchParams.get('i');if(!/^\d+$/.test(id||''))throw Error('Use a track link with a song ID');const j=JSON.parse(await urlFetch(`https://itunes.apple.com/lookup?id=${id}&entity=song`));const song=j.results?.find(x=>x.trackName&&x.artistName);if(!song)throw Error('Track metadata unavailable');return {title:song.trackName,artist:song.artistName,source:'iTunes lookup'};}
async function metadataTidal(raw){const u=new URL(raw);if(u.protocol!=='https:'||!['tidal.com','www.tidal.com'].includes(u.hostname)||u.port||u.username||u.password)throw Error('Invalid TIDAL URL');const m=/^\/(?:browse\/)?track\/(\d+)\/?$/.exec(u.pathname);if(!m)throw Error('Invalid track');const $=cheerio.load(await urlFetch(`https://tidal.com/browse/track/${m[1]}`));const title=$('meta[property="og:title"]').attr('content')||'';const index=title.indexOf(' - ');if(index<1)throw Error('Track metadata unavailable');return {artist:title.slice(0,index),title:title.slice(index+3),source:'TIDAL public page'};}
function normalize(s){return String(s).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
async function match(ctx,track) {
 let previewSent=false;
 try {
  const candidates=await itunes(`${track.artist} ${track.title}`,5);
  const song=candidates.find(x=>normalize(x.trackName).includes(normalize(track.title))&&normalize(x.artistName).includes(normalize(track.artist)));
  if(!song)return ctx.reply('⚠️ No confident iTunes match found. Try a different track.');
  const preview=song.previewUrl && /^https:\/\/[^/]+\.itunes\.apple\.com\//.test(song.previewUrl) ? song.previewUrl : null;
  if(preview) {try {await sendPreview(ctx,preview);previewSent=true;} catch {/* The final result identifies whether a preview was sent. */}}
  const results=await dl.searchYoutube(`${song.artistName} ${song.trackName}`,5);
  const terms=s=>normalize(s).split(' ').filter(x=>x.length>1);
  const wanted=[...terms(song.artistName),...terms(song.trackName)];
  const chosen=results.find(x=>{const title=normalize(x.title);return wanted.length && wanted.every(t=>title.includes(t));});
  if(!chosen)return ctx.reply(`⚠️ Could not find a sufficiently close YouTube match. Try another track.${previewSent ? ' The audio above was a short iTunes preview.' : ''}`);
  const note=`Metadata: ${track.source}; catalog match: iTunes. ${previewSent ? 'The first audio was an iTunes preview (up to 30 seconds).' : 'Preview unavailable.'} The full audio is a YouTube match and may differ from the original.`;
  await sendResult(ctx,chosen.url,'youtube','audio',chosen.title,{note,failureNote:previewSent?'The audio above was a short iTunes preview.':''});
 }catch(e){await ctx.reply(`⚠️ Could not find or download a match. Try again later.${previewSent ? ' The audio above was a short iTunes preview.' : ''}`);}
}
const commands=[
 make('spotify',['spotifydl'],'Find a matching track using Spotify metadata, iTunes and YouTube.','spotify <Spotify track URL>',async ctx=>{
  if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}spotify <Spotify track URL>\nExample: ${config.prefix}spotify https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl`);
  try{await match(ctx,await metadataSpotify(ctx.args[0]));}catch{await ctx.reply('⚠️ Could not read that Spotify track. Use a public track URL and try again.');}
 }),
 make('deezer',[],'Find a matching track using Deezer metadata, iTunes and YouTube.','deezer <Deezer track URL>',async ctx=>{
  if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}deezer <Deezer track URL>\nExample: ${config.prefix}deezer https://www.deezer.com/track/3135556`);
  try{await match(ctx,await metadataDeezer(ctx.args[0]));}catch{await ctx.reply('⚠️ Could not read that Deezer track. Use a public track URL and try again.');}
 }),
 make('applemusic',[],'Find a matching track using Apple Music, iTunes and YouTube.','applemusic <Apple Music track URL>',async ctx=>{
  if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}applemusic <Apple Music track URL>\nExample: ${config.prefix}applemusic https://music.apple.com/us/album/water-no-get-enemy/739004054?i=739004068`);
  try{await match(ctx,await metadataApple(ctx.args[0]));}catch{await ctx.reply('⚠️ Could not read that Apple Music track. Use a public song link and try again.');}
 }),
 make('tidal',[],'Find a matching track using TIDAL metadata, iTunes and YouTube.','tidal <TIDAL track URL>',async ctx=>{
  if(ctx.args.length!==1)return ctx.reply(`⚠️ Usage: ${config.prefix}tidal <TIDAL track URL>\nExample: ${config.prefix}tidal https://tidal.com/track/137457240`);
  try{await match(ctx,await metadataTidal(ctx.args[0]));}catch{await ctx.reply('⚠️ Could not read that TIDAL track. Use a public track URL and try again.');}
 }),
 make('spotifysearch',[],'Search the iTunes music catalog for songs.','spotifysearch <track or artist>',async ctx=>{
  const query=ctx.args.join(' ').trim();if(!query || query.length>200)return ctx.reply(`⚠️ Usage: ${config.prefix}spotifysearch <track or artist>\nExample: ${config.prefix}spotifysearch Fela Kuti`);
  try{const songs=await itunes(query,5);if(!songs.length)return ctx.reply('⚠️ No tracks found in iTunes.');await ctx.reply(`🎵 iTunes catalog results (not Spotify search)\n${songs.map((s,i)=>`${i+1}. ${s.artistName} — ${s.trackName}\n${s.trackViewUrl||''}`).join('\n')}\nSource: iTunes Search API.`);}catch{await ctx.reply('⚠️ iTunes Search is unavailable. Try again later.');}
 })
];
module.exports=commands;
