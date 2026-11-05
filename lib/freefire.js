'use strict';
const {boundedBody}=require('./public-files');
const INFO='https://wzapi.vercel.app/get';
const INFO_FALLBACK='https://free-fire-info-ob55.vercel.app/player-info';
const DETAILS='https://wzapi.vercel.app/get_all';
const LIKE_LEGACY='https://free-fire-like-ten.vercel.app/like';
const LIKE='https://ff-api-like-phi.vercel.app/api/like';
const LIKE_PROVIDER_VERIFIED=false;
const REGIONS=new Set('BR SAC US NA IND BD ID ME VN TH CIS RU PK SG EU EUROPE TW'.split(' '));
const UID=/^\d{5,20}$/;
const SECTIONS=new Set(['profile','stats','gear','all']);
const SECTION_ALIASES={overview:'profile',career:'stats',inventory:'gear',full:'all'};
const LIKE_REGIONS=new Map(Object.entries({ME:'me',BR:'br',US:'us',IND:'ind',BD:'bd',ID:'id',SG:'sg',TH:'th',VN:'vn',RU:'ru',PK:'pk'}));

function inputs(args){
 if(!Array.isArray(args)||args.length!==2)return null;
 const region=String(args[0]).toUpperCase(),uid=String(args[1]);
 return REGIONS.has(region)&&UID.test(uid)?{region,uid}:null;
}
function infoArgs(args){
 if(!Array.isArray(args)||(args.length!==2&&args.length!==3))return null;
 const base=inputs(args.slice(0,2));if(!base)return null;
 const requested=args.length===3?String(args[2]).toLowerCase():'profile';
 const section=SECTION_ALIASES[requested]||requested;
 return SECTIONS.has(section)?{...base,section}:null;
}
function clean(value,max=80){
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const s=String(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').trim();
 return s?s.slice(0,max):null;
}
function decimal(v){
 if(v===null||v===undefined||typeof v==='boolean')return null;
 if(typeof v==='string'&&!/^\d{1,15}(?:\.\d{1,4})?$/.test(v))return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
}
function count(v){const n=decimal(v);return n!==null&&Number.isSafeInteger(n)&&n>=0?n:null;}
function dateUTC(v){
 const n=count(v);if(n===null||n===0||n>8640000000000)return null;
 const date=new Date(n*1000);return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}
function ids(v,limit=30){return Array.isArray(v)?v.slice(0,limit).map(count).filter(x=>x!==null):[];}
function pick(o,snake,camel){return o&&typeof o==='object'?(o[snake]??o[camel]):undefined;}
function bool(v){return typeof v==='boolean'?v:null;}
function listNums(v,limit=40){return Array.isArray(v)?v.slice(0,limit).map(count).filter(x=>x!==null):[];}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function fetchJson(base,params={},timeout=15000,init={}){
 const u=new URL(base);
 for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
 const headers={accept:'application/json',...(init.headers||{})};
 if(init.body&&!Object.keys(headers).some(k=>k.toLowerCase()==='content-type'))headers['content-type']='application/json';
 const r=await fetch(u,{...init,headers,redirect:'error',signal:AbortSignal.timeout(timeout)});
 const isJson=/^application\/(?:[^;]+\+)?json(?:;|$)/i.test(r.headers.get('content-type')||'');
 if(!r.ok){
  if(isJson)try{return {ok:false,status:r.status,data:JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'))};}catch{}
  await r.body?.cancel();return {ok:false,status:r.status,data:null};
 }
 if(!isJson){await r.body?.cancel();throw Error('INVALID');}
 try{
  const data=JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'));
  return {ok:true,status:r.status,data};
 }catch{throw Error('INVALID');}
}
async function request(base,params,timeout=15000,init={}){
 const r=await fetchJson(base,params,timeout,init);
 if(!r.ok)throw Error(`HTTP_${r.status}`);
 return r.data;
}

function normalizeProfile(data,uid,source){
 const snake=!!data?.basic_info,b=snake?data.basic_info:data?.basicInfo;
 const id=snake?b?.account_id:b?.accountId;
 if(!b||String(id)!==uid||!clean(b.nickname))throw Error('INVALID');
 const clan=pick(data,'clan_basic_info','clanBasicInfo')||{},pet=pick(data,'pet_info','petInfo')||{};
 const social=pick(data,'social_info','socialInfo')||{},credit=pick(data,'credit_score_info','creditScoreInfo')||{};
 const profile=pick(data,'profile_info','profileInfo')||{},prime=pick(b,'prime_privilege_detail','primePrivilegeDetail')||b.primeInfo||{};
 return {
  uid,name:clean(b.nickname),region:clean(b.region),level:count(b.level),likes:count(b.liked),exp:count(b.exp),
  prime:count(pick(prime,'prime_level','primeLevel')??prime.level??b.primeLevel),
  created:dateUTC(pick(b,'create_at','createAt')),lastLogin:dateUTC(pick(b,'last_login_at','lastLoginAt')),
  season:count(pick(b,'season_id','seasonId')),release:clean(pick(b,'release_version','releaseVersion')),
  badges:count(pick(b,'badge_cnt','badgeCnt')),credit:count(pick(credit,'credit_score','creditScore')),
  membership:bool(pick(b,'membership_state','membershipState')),elitePass:bool(pick(b,'has_elite_pass','hasElitePass')),
  veteran:clean(pick(b,'pre_veteran_type','preVeteranType')),
  br:count(pick(b,'ranking_points','rankingPoints')),brRank:count(b.rank),brMaxRank:count(pick(b,'max_rank','maxRank')),
  cs:count(pick(b,'cs_ranking_points','csRankingPoints')),csRank:count(pick(b,'cs_rank','csRank')),csMaxRank:count(pick(b,'cs_max_rank','csMaxRank')),
  guild:clean(pick(clan,'clan_name','clanName')),guildLevel:count(pick(clan,'clan_level','clanLevel')),guildMembers:count(pick(clan,'member_num','memberNum')),
  pet:clean(pet.name),petId:count(pet.id),petLevel:count(pet.level),
  avatar:count(pick(profile,'avatar_id','avatarId')),banner:count(pick(b,'banner_id','bannerId')),title:count(b.title),
  outfit:ids(profile.clothes),weapons:ids(pick(b,'weapon_skin_shows','weaponSkinShows')),
  signature:clean(social.signature,200),language:clean(social.language),gender:clean(social.gender),
  duo:null,source:clean(source,80)
 };
}
async function info(region,uid){
 if(!REGIONS.has(region)||!UID.test(String(uid)))throw Error('INVALID');
 try{return normalizeProfile(await request(INFO,{region,uid}),uid,'wzapi.vercel.app/get');}
 catch{return normalizeProfile(await request(INFO_FALLBACK,{region,uid}),uid,'free-fire-info-ob55.vercel.app/player-info');}
}

function combat(v){
 const d=v?.detailed_stats||v?.detailedStats||{};
 return {
  games:count(pick(v,'games_played','gamesPlayed')),wins:count(v?.wins),kills:count(v?.kills),
  headshotKills:count(d.headshot_kills??d.head_shot_kills??d.headshotKills),headshots:count(d.headshots??d.headshot_count??d.headshotCount),
  damage:count(d.damage),deaths:count(d.deaths),assists:count(d.assists),revives:count(d.revives),
  topN:count(d.top_n_times??d.topNTimes??d.top10_times??d.top10Times),highestKills:count(d.highest_kills??d.highestKills),
  mvp:count(d.mvp_count??d.mvpCount),streakWins:count(d.streak_wins??d.streakWins),ratingPoints:decimal(d.rating_points??d.ratingPoints)
 };
}
function normalizeDetails(data,uid){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID');
 if(String(data.uid??data.UID??'')!==uid)throw Error('INVALID');
 const sections=data.data&&typeof data.data==='object'?data.data:null;if(!sections)throw Error('INVALID');
 const personal=pick(sections,'personal_show','personalShow');if(!personal)throw Error('INVALID');
 const profile=normalizeProfile(personal,uid,'wzapi.vercel.app/get_all');
 const stats=sections.stats||{},csWrapper=sections.cs_stats||{},cs=csWrapper.cs_stats||csWrapper.CSStats||csWrapper;
 const heroic=pick(sections,'heroic_history','heroicHistory')||{};
 const outfitSection=sections.outfit||{},outfitProfile=outfitSection.profile||{};
 const pass=Array.isArray(pick(personal,'history_ep_info','historyEpInfo'))?pick(personal,'history_ep_info','historyEpInfo'):[];
 const userSpark=pick(personal,'user_spark_info','userSparkInfo')||{},collabSpark=pick(personal,'collab_spark_info','collabSparkInfo')||{};
 const wishlist=sections.wishlist||{},weaponGlory=sections.weapon_glory||sections.weaponGlory||{},occupation=sections.occupation||{};
 const weaponRecords=Array.isArray(weaponGlory.records?.records)?weaponGlory.records.records:[];
 const skillSource=outfitProfile.equiped_skills||outfitProfile.equippedSkills||[];
 const skillIds=(Array.isArray(skillSource)?skillSource:[]).slice(0,12).map(x=>count(typeof x==='object'?(x.skill_id??x.skillId):x)).filter(x=>x!==null);
 return {
  profile,
  brCareer:{solo:combat(stats.solo_stats||stats.soloStats),duo:combat(stats.duo_stats||stats.duoStats),squad:combat(stats.quad_stats||stats.quadStats)},
  csCareer:combat(cs),
  heroic:{
   brSeasons:listNums(heroic.br_reached_season),brMaxRanks:listNums(heroic.br_reached_season_max_rank),brGrandmaster:listNums(heroic.br_grandmaster_seasons),
   csSeasons:listNums(heroic.cs_reached_season),csMaxRanks:listNums(heroic.cs_reached_season_max_rank),csGrandmaster:listNums(heroic.cs_grandmaster_seasons)
  },
  outfit:{
   avatar:count(outfitProfile.avatar_id??outfitProfile.avatarId),clothes:ids(outfitProfile.clothes,12),skills:skillIds,
   skinColor:count(outfitProfile.skin_color??outfitProfile.skinColor),awakened:bool(outfitProfile.is_selected_awaken??outfitProfile.isSelectedAwaken)
  },
  pass:{
   count:pass.length,elite:pass.filter(x=>x.owned_pass===true||x.hasElitePass===true).length,
   latest:pass.slice(0,3).map(x=>({season:count(x.ep_event_id??x.PassEvent),badges:count(x.badge_cnt??x.badgeCount),level:count(x.max_level??x.PassLevel),owned:bool(x.owned_pass??x.hasElitePass)}))
  },
  sparks:{
   userLevel:count(userSpark.level),userState:clean(userSpark.state),userStreak:count(userSpark.login_streak_days??userSpark.loginStreakDays),
   collabLevel:count(collabSpark.level),collabState:clean(collabSpark.state),collabStreak:count(collabSpark.login_streak_days??collabSpark.loginStreakDays)
  },
  wishlist:{count:Array.isArray(wishlist.items)?wishlist.items.length:null,ids:(Array.isArray(wishlist.items)?wishlist.items:[]).slice(0,8).map(x=>count(x.item_id??x.itemId)).filter(x=>x!==null)},
  weaponGlory:{
   count:weaponRecords.length,
   top:weaponRecords.filter(x=>count(x.season_id??x.seasonId)===0).sort((a,b)=>(count(b.weapon_power??b.weaponPower)??-1)-(count(a.weapon_power??a.weaponPower)??-1)).slice(0,3).map(x=>({id:count(x.weapon_id??x.weaponId),power:count(x.weapon_power??x.weaponPower),kills:count(x.weapon_kill??x.weaponKill),headshots:count(x.weapon_headshot??x.weaponHeadshot)}))
  },
  occupation:{records:Array.isArray(occupation.infos)?occupation.infos.length:null},
  gallery:null,dynamicDuo:null,source:'wzapi.vercel.app/get_all'
 };
}
async function details(region,uid){
 if(!REGIONS.has(region)||!UID.test(String(uid)))throw Error('INVALID');
 return normalizeDetails(await request(DETAILS,{region,uid},25000),uid);
}

function likeRegion(region){return LIKE_REGIONS.get(String(region).toUpperCase())||null;}
function likeProviderEnabled(){return module.exports.LIKE_PROVIDER_VERIFIED===true;}
async function likeProvider(region,uid){
 const code=likeRegion(region);if(!code||!UID.test(String(uid)))throw Error('UNSUPPORTED_REGION');
 const body=JSON.stringify({uid:String(uid),region:code});
 const r=await fetchJson(LIKE,{},45000,{method:'POST',body,headers:{'content-type':'application/json'}});
 let message=null;
 if(r.data&&typeof r.data==='object')for(const key of ['message','error','detail'])if(clean(r.data[key],160)){message=clean(r.data[key],160);break;}
 return {ok:r.ok,status:r.status,message,data:r.data&&typeof r.data==='object'?r.data:null};
}
async function like(region,uid){
 const data=await request(LIKE_LEGACY,{uid,server_name:region},45000);
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID');
 if(data.status===2||data.status==='2')return {status:'not-reported'};
 if(data.status!==1&&data.status!=='1')throw Error('INVALID');
 const returned=String(data.UID??'');if(returned!==uid)throw Error('INVALID');
 const added=count(data.LikesGivenByAPI),before=count(data.LikesbeforeCommand),after=count(data.LikesafterCommand);
 if(added===null||before===null||after===null||after<before||after-before!==added)throw Error('INVALID');
 return {status:'reported',added,before,after,name:clean(data.PlayerNickname)};
}
async function attemptLikes(region,uid,options={}){
 if(!REGIONS.has(region)||!UID.test(String(uid)))throw Error('INVALID');
 if(!likeRegion(region))throw Error('UNSUPPORTED_REGION');
 if(!likeProviderEnabled())throw Error('NO_VERIFIED_PROVIDER');
 let beforeProfile;
 try{beforeProfile=await module.exports.info(region,uid);}catch{throw Error('NO_BEFORE_COUNT');}
 const before=count(beforeProfile?.likes);if(before===null)throw Error('NO_BEFORE_COUNT');
 let provider;
 try{provider=await module.exports.likeProvider(region,uid);}catch(e){provider={ok:false,status:null,message:clean(e?.message,120),error:true};}
 const firstWait=Number.isFinite(options.waitMs)?Math.max(0,Math.min(options.waitMs,60000)):8000;
 const secondWait=Number.isFinite(options.secondWaitMs)?Math.max(0,Math.min(options.secondWaitMs,60000)):12000;
 if(firstWait)await delay(firstWait);
 async function readAfter(){try{const p=await module.exports.info(region,uid);return count(p?.likes);}catch{return null;}}
 let after=await readAfter();
 if((after===null||after<=before)&&secondWait){await delay(secondWait);const again=await readAfter();if(again!==null)after=again;}
 const increase=after!==null&&after>before?after-before:0;
 return {
  status:after===null?'unverified':increase>0?'observed':'not-observed',
  before,after,increase,name:clean(beforeProfile.name),provider
 };
}
module.exports={INFO,INFO_FALLBACK,DETAILS,LIKE,LIKE_LEGACY,LIKE_PROVIDER_VERIFIED,LIKE_REGIONS,REGIONS,UID,SECTIONS,SECTION_ALIASES,inputs,infoArgs,clean,decimal,count,dateUTC,ids,pick,bool,listNums,fetchJson,request,normalizeProfile,normalizeDetails,combat,info,details,likeRegion,likeProviderEnabled,likeProvider,like,attemptLikes};
