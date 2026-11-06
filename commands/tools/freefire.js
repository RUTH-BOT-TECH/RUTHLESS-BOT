'use strict';
const ff=require('../../lib/freefire'),config=require('../../config'),crypto=require('node:crypto');
const base={category:'tools',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:15};
const running=new Set(),last=new Map(),drafts=new Map(),MAX=3;

function usage(name){
 if(name==='ffinfo')return `⚠️ Usage: ${config.prefix}ffinfo <region> <UID> [profile|stats|gear|all]\nExample: ${config.prefix}ffinfo ME 123456789 stats\nUse your game server, not automatically your country. Never send passwords or OTPs.`;
 return `⚠️ Usage: ${config.prefix}fflike <region> <UID>\nExample: ${config.prefix}fflike ME 123456789\nUse your game server, not automatically your country. Never send passwords or OTPs.`;
}
function show(v){return v===null||v===undefined?'Not provided':String(v);}
function yesNo(v){return v===null||v===undefined?'Not provided':v?'Yes':'No';}
function num(v){return v===null||v===undefined?'Not provided':Number.isInteger(v)?String(v):v.toFixed(1);}
function idList(a,limit=8){
 if(!Array.isArray(a)||!a.length)return 'Not provided';
 const head=a.slice(0,limit).join(', ');
 return a.length>limit?`${head} (+${a.length-limit} more)`:head;
}
function numberList(a,limit=12){
 if(!Array.isArray(a)||!a.length)return 'Not provided';
 const head=a.slice(0,limit).join(', ');
 return a.length>limit?`${head} (+${a.length-limit} more)`:head;
}
function fallbackNote(x){
 if(!x||!x.fallbackRegion)return '';
 const requested=x.requestedRegion||'the requested region';
 return `\nProvider fallback: ${x.fallbackRegion} token was used because ${requested} upstream was unavailable.`;
}
function formatProfile(p,v){
 return `🎮 Free Fire profile — overview
Name: ${show(p.name)}
UID: ${p.uid} • Region: ${show(p.region)} • Game version: ${show(p.release)}
Level: ${show(p.level)} • EXP: ${show(p.exp)} • Likes: ${show(p.likes)}
Prime level: ${show(p.prime)} • Prime membership flag: ${yesNo(p.membership)}
Created: ${show(p.created)} • Last login reported: ${show(p.lastLogin)} (UTC)
Season: ${show(p.season)} • Badges: ${show(p.badges)} • Credit score: ${show(p.credit)}
Elite Pass flag: ${yesNo(p.elitePass)} • Veteran: ${show(p.veteran)}

🏆 Ranks (provider IDs, not translated names)
BR rank: ${show(p.brRank)} • Best: ${show(p.brMaxRank)} • Points: ${show(p.br)}
CS rank: ${show(p.csRank)} • Best: ${show(p.csMaxRank)} • Points: ${show(p.cs)}

👥 Social & guild
Guild: ${show(p.guild)}${p.guild?` • Level: ${show(p.guildLevel)} • Members: ${show(p.guildMembers)}`:''}
Dynamic Duo: Not supplied by public UID/region data; the provider that offers it requires an account token.
Language: ${show(p.language)} • Gender field: ${show(p.gender)}
Signature: ${show(p.signature)}

🐾 Equipment summary (item IDs)
Pet: ${show(p.pet)} • ID: ${show(p.petId)} • Level: ${show(p.petLevel)}
Avatar: ${show(p.avatar)} • Banner: ${show(p.banner)} • Title: ${show(p.title)}
Equipped outfit: ${idList(p.outfit)} • Weapon skins: ${idList(p.weapons)}

More: ${config.prefix}ffinfo ${v.region} ${v.uid} stats | gear | all
Source: ${show(p.source)} (unofficial). UID and region may be shared with the providers contacted. Data may be cached, incomplete or outdated.${fallbackNote(p)}`;
}
function combatLine(label,x){
 const parts=[`${show(x.games)} games`,`${show(x.wins)} wins`,`${show(x.kills)} kills`,`${show(x.headshotKills)} HS kills`,`${show(x.headshots)} headshots`,`${show(x.damage)} damage`,`${show(x.deaths)} deaths`];
 if(x.revives!==null&&x.revives!==undefined)parts.push(`${show(x.revives)} revives`);
 if(x.topN!==null&&x.topN!==undefined)parts.push(`${show(x.topN)} top finishes`);
 if(x.highestKills!==null&&x.highestKills!==undefined)parts.push(`best ${show(x.highestKills)} kills`);
 return `${label}: ${parts.join(' • ')}`;
}
function formatStats(d,v){
 const c=d.csCareer,h=d.heroic;
 return `📊 Free Fire career stats — ${v.uid}
Provider: ${show(d.source)}. Exact UID was checked; stats may be cached.${fallbackNote(d)}

BR solo
${combatLine('Solo',d.brCareer.solo)}

BR duo
${combatLine('Duo',d.brCareer.duo)}

BR squad
${combatLine('Squad',d.brCareer.squad)}

Clash Squad
${combatLine('CS',c)} • ${show(c.assists)} assists • ${show(c.mvp)} MVP • streak ${show(c.streakWins)} • rating points ${num(c.ratingPoints)}

Historic rank badges
BR reached seasons: ${numberList(h.brSeasons)}
BR max rank IDs: ${numberList(h.brMaxRanks)}
BR Grandmaster seasons: ${numberList(h.brGrandmaster)}
CS reached seasons: ${numberList(h.csSeasons)}
CS max rank IDs: ${numberList(h.csMaxRanks)}
CS Grandmaster seasons: ${numberList(h.csGrandmaster)}
Occupation records: ${show(d.occupation.records)}

Ranks and seasons above are raw provider IDs, not official labels.`;
}
function formatGear(d,v){
 const o=d.outfit,p=d.pass,s=d.sparks,w=d.wishlist,g=d.weaponGlory;
 const latest=p.latest.map(x=>`pass ${show(x.season)}: level ${show(x.level)}, badges ${show(x.badges)}, Elite ${yesNo(x.owned)}`).join('; ')||'Not provided';
 const top=g.top.map(x=>`weapon ${show(x.id)}: power ${show(x.power)}, kills ${show(x.kills)}, HS ${show(x.headshots)}`).join('; ')||'Not provided';
 return `🎒 Free Fire equipment & collection — ${v.uid}
Equipped outfit
Avatar: ${show(o.avatar)} • Skin colour ID: ${show(o.skinColor)} • Awakened: ${yesNo(o.awakened)}
Clothes IDs: ${idList(o.clothes)} • Skill IDs: ${idList(o.skills)}

Pet
${show(d.profile.pet)} • ID: ${show(d.profile.petId)} • Level: ${show(d.profile.petLevel)} • Weapon skins: ${idList(d.profile.weapons)}

Booyah Pass history
Records: ${show(p.count)} • Elite Pass owned in ${show(p.elite)} records
Latest: ${latest}

Spark fields
User spark: level ${show(s.userLevel)}, state ${show(s.userState)}, login streak ${show(s.userStreak)} days
Collab spark: level ${show(s.collabLevel)}, state ${show(s.collabState)}, login streak ${show(s.collabStreak)} days

Wishlist
Items: ${show(w.count)} • IDs: ${idList(w.ids)}

Weapon Glory
Records: ${show(g.count)} • Top all-time: ${top}

Dynamic Duo: not available from this public UID/region source. No account password, OTP or token was requested.
Source: ${show(d.source)} (unofficial). Item IDs are provider IDs and may be incomplete.${fallbackNote(d)}`;
}
function providerLine(r){
 const p=r.provider||{},status=p.status===null||p.status===undefined?'no HTTP status':`HTTP ${p.status}`;
 return `Provider: ${status}${p.message?` • ${p.message}`:''}.`;
}

const info={...base,name:'ffinfo',aliases:['freefireinfo'],description:'Look up Free Fire profile, career stats and equipment through an unofficial external service.',usage:'ffinfo <region> <UID> [profile|stats|gear|all]',async run(ctx){
 const v=ff.infoArgs(ctx.args);if(!v)return ctx.reply(usage('ffinfo'));
 try{
  if(v.section==='profile')return ctx.reply(formatProfile(await ff.info(v.region,v.uid),v));
  const d=await ff.details(v.region,v.uid);
  if(v.section==='stats')return ctx.reply(formatStats(d,v));
  if(v.section==='gear')return ctx.reply(formatGear(d,v));
  await ctx.reply(formatProfile(d.profile,v));
  await ctx.reply(formatStats(d,v));
  return ctx.reply(formatGear(d,v));
 }catch(e){
  if(e?.message==='PROVIDER_REGION_UNAVAILABLE'){
   const region=e.region||v.region;
   const fallback=e.fallbackRegion?` The ${e.fallbackRegion} token fallback was also unavailable.`:'';
   return ctx.reply(`⚠️ The unofficial provider's ${region} data source is temporarily unavailable (missing upstream token/server URL).${fallback} Your UID may still be valid; try again later or use ${config.prefix}ffinfo BD ${v.uid} ${v.section} while ${region} is down.`);
  }
  return ctx.reply('⚠️ Profile lookup failed. Check the UID and game server; the unofficial provider may be unavailable, rate-limited or missing that section.');
 }
}};

const like={...base,name:'fflike',aliases:['freefirelike'],description:'Like requests are disabled until a verified provider is configured; fail-closed notice only.',usage:'fflike <region> <UID>',async run(ctx){
 const now=Date.now(),identity=`${ctx.chat}:${ctx.sender}`;
 for(const [k,d] of drafts)if(d.expires<=now)drafts.delete(k);
 let v;
 if(ctx.args[0]==='confirm'){
  const draft=drafts.get(identity);if(ctx.args.length!==2||!draft||draft.token!==ctx.args[1]||draft.expires<=now)return ctx.reply('⚠️ Preview expired or code did not match. Prepare the like request again.');
  v=draft.value;drafts.delete(identity);
 }else{
  v=ff.inputs(ctx.args);if(!v)return ctx.reply(usage('fflike'));
  if(!ff.likeProviderEnabled()||!ff.likeRegion(v.region))return ctx.reply(`⚠️ No verified like provider is configured for ${v.region}. No request was prepared.`);
  if(!drafts.has(identity)&&drafts.size>=1000)return ctx.reply('⏳ Too many pending requests. Try later.');
  const token=crypto.randomBytes(6).toString('hex');drafts.set(identity,{value:v,token,expires:now+120000});
  return ctx.reply(`❤️ Like request preview\nUID: ${v.uid} • Server: ${v.region}\nAn unofficial provider will receive the UID and server. This version uses a provider that lists ${v.region} and checks likes through a separate profile source before and after. One request only; no fixed 100 or 220 likes are promised. Delivery, delay and account safety are not guaranteed. Use only with the account owner's permission; never send passwords or OTPs.\nConfirm within 2 minutes: ${config.prefix}fflike confirm ${token}`);
 }
 const key=v.uid;
 for(const [k,t] of last)if(t<=now)last.delete(k);
 if(running.has(key)||running.size>=MAX)return ctx.reply('⏳ A like request for this UID is already running, or the service is busy.');
 if(last.has(key))return ctx.reply('⏳ This UID was recently attempted. Check its likes before trying again.');
 if(last.size>=1000)return ctx.reply('⏳ Like requests are busy. Try later.');
 running.add(key);last.set(key,now+60000);
 try{
  const r=await ff.attemptLikes(v.region,v.uid);
  if(r.status==='observed')return ctx.reply(`❤️ Free Fire likes\nUID: ${v.uid}${r.name?`\nPlayer: ${r.name}`:''}\nIndependent profile lookup: ${r.before} → ${r.after} • observed +${r.increase}.\n${providerLine(r)}\nThis is a third-party result; confirm the count in-game. No automatic retry was made.`);
  if(r.status==='not-observed')return ctx.reply(`⚠️ No like increase was observed in the profile lookups (before ${r.before}, after ${show(r.after)}).\n${providerLine(r)}\nThe provider may have failed, been delayed, or returned cached data. Check the game before retrying; no automatic retry was made.`);
  return ctx.reply(`⚠️ The provider may have acted, but the after-request profile lookup could not verify it (before ${r.before}).\n${providerLine(r)}\nCheck the game before retrying; no automatic retry was made.`);
 }catch(e){
  if(e?.message==='UNSUPPORTED_REGION'||e?.message==='NO_VERIFIED_PROVIDER')return ctx.reply(`⚠️ No verified like provider is configured for ${v.region}. No request was sent.`);
  if(e?.message==='NO_BEFORE_COUNT')return ctx.reply('⚠️ The current like count could not be read, so no like request was sent. Try the info command again later.');
  return ctx.reply('⚠️ The like attempt could not be completed or verified. The provider may be unavailable or still processing. Check the game before trying again; no automatic retry was made.');
 }finally{running.delete(key);last.set(key,Date.now()+60000);}
}};
module.exports=[info,like];
