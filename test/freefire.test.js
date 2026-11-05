'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),ff=require('../lib/freefire'),[info,like]=require('../commands/tools/freefire'),selftest=require('../lib/selftest');
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
function context(args){const out=[];return {args,chat:'test@s.whatsapp.net',sender:'test@s.whatsapp.net',reply:async s=>out.push(s),out};}
async function prepare(c){await like.run(c);const m=/confirm ([a-f0-9]{12})/.exec(c.out.at(-1));assert.ok(m);c.args=['confirm',m[1]];}
function enableLikes(){const old=ff.LIKE_PROVIDER_VERIFIED;ff.LIKE_PROVIDER_VERIFIED=true;return()=>{ff.LIKE_PROVIDER_VERIFIED=old;};}
function detailsFixture(uid){return {uid,region:'ME',data:{
 personal_show:{basic_info:{account_id:uid,nickname:'Example',region:'ME',level:50,liked:123,prime_privilege_detail:{prime_level:3},weapon_skin_shows:[1,2]},clan_basic_info:{clan_name:'Guild'},pet_info:{name:'Pet',id:9,level:4},profile_info:{avatar_id:10,clothes:[11,12]},social_info:{signature:'Test'},credit_score_info:{credit_score:100},history_ep_info:[{ep_event_id:1,badge_cnt:10,max_level:50,owned_pass:true}],user_spark_info:{level:23,state:'ACTIVE',login_streak_days:103},collab_spark_info:{level:25,state:'ACTIVE',login_streak_days:194}},
 stats:{solo_stats:{account_id:uid,games_played:10,wins:2,kills:20,detailed_stats:{headshot_kills:3,headshots:4,damage:500,deaths:5,revives:1,top_n_times:2,highest_kills:7}},duo_stats:{account_id:uid,games_played:3,wins:1,kills:4,detailed_stats:{headshot_kills:1,headshots:2,damage:100,deaths:2,revives:0,top_n_times:1,highest_kills:3}},quad_stats:{account_id:uid,games_played:5,wins:1,kills:6,detailed_stats:{headshot_kills:2,headshots:3,damage:200,deaths:3,revives:1,top_n_times:2,highest_kills:4}}},
 cs_stats:{cs_stats:{account_id:uid,games_played:8,wins:3,kills:9,detailed_stats:{head_shot_kills:2,damage:400,deaths:4,assists:5,mvp_count:1,streak_wins:2,rating_points:10.5}}},
 heroic_history:{br_reached_season:[1,2],br_reached_season_max_rank:[319,320],cs_reached_season:[3],cs_reached_season_max_rank:[324]},
 outfit:{profile:{avatar_id:10,clothes:[11,12],equiped_skills:[{skill_id:21},{skill_id:22}],skin_color:50,is_selected_awaken:true}},
 wishlist:{items:[{item_id:31},{item_id:32}]},weapon_glory:{records:{records:[{season_id:0,weapon_id:89,weapon_power:176,weapon_kill:57,weapon_headshot:17}]}},occupation:{infos:[{games:1}]}
}};}

test('validates region, numeric UID, info sections and like-region support; never accepts secrets or URLs',()=>{
 assert.deepEqual(ff.inputs(['me','123456789']),{uid:'123456789',region:'ME'});
 assert.deepEqual(ff.infoArgs(['ME','123456789','stats']),{uid:'123456789',region:'ME',section:'stats'});
 assert.deepEqual(ff.infoArgs(['ME','123456789','full']),{uid:'123456789',region:'ME',section:'all'});
 for(const a of [[],['ME'],['NO','123456789'],['ME','https://bad/'],['ME','123','extra'],['ME','123456789','password'],['ME','123456789012345678901']])assert.equal(ff.inputs(a),null);
 assert.equal(ff.infoArgs(['ME','123456789','bogus']),null);
 assert.equal(ff.count(null),null);assert.equal(ff.count(false),null);assert.equal(ff.count('0'),0);assert.equal(ff.decimal('1.5'),1.5);
 assert.equal(ff.likeRegion('ME'),'me');assert.equal(ff.likeRegion('EU'),null);assert.equal(ff.likeProviderEnabled(),false);
});

test('info fetch uses the fixed provider, validates exact UID and displays only selected fields',async()=>{
 const old=global.fetch;
 try{
  global.fetch=async(u,o)=>{
   assert.equal(new URL(u).host,'wzapi.vercel.app');assert.equal(new URL(u).pathname,'/get');
   assert.equal(u.searchParams.get('uid'),'123456789');assert.equal(o.redirect,'error');
   return json({basic_info:{account_id:'123456789',nickname:'Example',region:'ME',level:50,liked:123,ranking_points:42,cs_ranking_points:4,prime_privilege_detail:{prime_level:3},create_at:'1703542502'},clan_basic_info:{clan_name:'Guild'},password:'must-not-display'});
  };
  const x=await ff.info('ME','123456789');assert.equal(x.likes,123);assert.equal(x.prime,3);assert.equal(x.created,'2023-12-25');
  const c=context(['ME','123456789']);await info.run(c);
  assert.match(c.out[0],/Example/);assert.match(c.out[0],/Likes: 123/);assert.match(c.out[0],/Prime level: 3/);assert.match(c.out[0],/Dynamic Duo: Not supplied/);assert.match(c.out[0],/unofficial/);assert.doesNotMatch(c.out[0],/must-not-display/);
  assert.throws(()=>ff.normalizeProfile({basic_info:{account_id:'987654321',nickname:'Wrong'}},'123456789','x'),/INVALID/);
 }finally{global.fetch=old;}
});

test('profile fallback uses only the second fixed provider and validates exact identity',async()=>{
 const old=global.fetch,calls=[];
 try{
  global.fetch=async u=>{calls.push(new URL(u).host);if(calls.length===1)return json({error:'unavailable'},503);return json({basicInfo:{accountId:'123456789',nickname:'Fallback',region:'ME',level:4,liked:12}});};
  const result=await ff.info('ME','123456789');assert.deepEqual(calls,['wzapi.vercel.app','free-fire-info-ob55.vercel.app']);assert.equal(result.name,'Fallback');assert.equal(result.source,'free-fire-info-ob55.vercel.app/player-info');
 }finally{global.fetch=old;}
});

test('malformed info input and provider failure give one honest reply',async()=>{
 const old=ff.info;
 try{
  const a=context(['ME','bad']);await info.run(a);assert.equal(a.out.length,1);assert.match(a.out[0],/Usage/);
  const bad=context(['ME','123456789','password']);await info.run(bad);assert.equal(bad.out.length,1);assert.match(bad.out[0],/Usage/);
  ff.info=async()=>{throw Error('offline')};const b=context(['ME','123456789']);await info.run(b);assert.match(b.out[0],/lookup failed/);
 }finally{ff.info=old;}
});

test('details validates the envelope UID and formats stats, gear and all sections',async()=>{
 const old=global.fetch;
 try{
  global.fetch=async u=>{
   assert.equal(new URL(u).host,'wzapi.vercel.app');assert.equal(new URL(u).pathname,'/get_all');
   assert.equal(u.searchParams.get('region'),'ME');assert.equal(u.searchParams.get('uid'),'123456789');
   return json(detailsFixture('123456789'));
  };
  const d=await ff.details('ME','123456789');
  assert.equal(d.profile.likes,123);assert.equal(d.brCareer.solo.games,10);assert.equal(d.csCareer.mvp,1);assert.equal(d.pass.elite,1);assert.equal(d.wishlist.count,2);
  assert.throws(()=>ff.normalizeDetails(detailsFixture('999'),'123456789'),/INVALID/);
  const stats=context(['ME','123456789','stats']);await info.run(stats);assert.match(stats.out[0],/BR solo/);assert.match(stats.out[0],/Solo: 10 games/);assert.match(stats.out[0],/CS: 8 games/);
  const gear=context(['ME','123456789','gear']);await info.run(gear);assert.match(gear.out[0],/Wishlist/);assert.match(gear.out[0],/Spark fields/);assert.match(gear.out[0],/No account password, OTP or token/);
  const all=context(['ME','123456789','all']);await info.run(all);assert.equal(all.out.length,3);assert.match(all.out[0],/Prime level: 3/);assert.match(all.out[1],/career stats/);assert.match(all.out[2],/equipment & collection/);
 }finally{global.fetch=old;}
});

test('legacy like response parser requires status, matching UID and consistent arithmetic',async()=>{
 const old=global.fetch;
 try{
  const sample={status:1,UID:123456789,LikesGivenByAPI:40,LikesbeforeCommand:50,LikesafterCommand:90,PlayerNickname:'Player'};
  global.fetch=async(u,o)=>{assert.equal(new URL(u).host,'free-fire-like-ten.vercel.app');assert.equal(u.searchParams.get('server_name'),'ME');assert.equal(o.redirect,'error');return json(sample);};
  assert.deepEqual(await ff.like('ME','123456789'),{status:'reported',added:40,before:50,after:90,name:'Player'});
  for(const x of [{...sample,UID:111111111},{...sample,LikesafterCommand:91},{...sample,LikesGivenByAPI:null},{...sample,status:0},{...sample,UID:undefined}]){global.fetch=async()=>json(x);await assert.rejects(ff.like('ME','123456789'),/INVALID/);}
  global.fetch=async()=>json({status:2});assert.equal((await ff.like('ME','123456789')).status,'not-reported');
 }finally{global.fetch=old;}
});

test('like provider sends only UID and mapped region to its fixed POST endpoint',async()=>{
 const old=global.fetch;
 try{
  global.fetch=async(u,o)=>{
   assert.equal(new URL(u).href,'https://ff-api-like-phi.vercel.app/api/like');assert.equal(o.method,'POST');assert.equal(o.redirect,'error');
   assert.equal(o.headers['content-type'],'application/json');assert.deepEqual(JSON.parse(o.body),{uid:'123456789',region:'me'});
   return json({success:true});
  };
  const r=await ff.likeProvider('ME','123456789');assert.equal(r.ok,true);assert.equal(r.status,200);
  global.fetch=async()=>json({error:'busy'},503);const bad=await ff.likeProvider('ME','123456789');assert.equal(bad.ok,false);assert.equal(bad.status,503);assert.equal(bad.message,'busy');
 }finally{global.fetch=old;}
});

test('attemptLikes fails closed when no provider is verified; with one enabled it uses independent lookups and no retry',async()=>{
 const oldInfo=ff.info,oldProvider=ff.likeProvider;
 await assert.rejects(ff.attemptLikes('ME','123456789',{waitMs:0,secondWaitMs:0}),/NO_VERIFIED_PROVIDER/);
 const restore=enableLikes();
 try{
  let reads=0,calls=0;
  ff.info=async()=>{reads++;return {name:'Test',likes:reads===1?10:12};};
  ff.likeProvider=async()=>{calls++;return {ok:true,status:200,message:null,data:{success:true}};};
  const observed=await ff.attemptLikes('ME','123456789',{waitMs:0,secondWaitMs:0});
  assert.equal(calls,1);assert.equal(reads,2);assert.equal(observed.status,'observed');assert.equal(observed.increase,2);
  reads=0;calls=0;ff.info=async()=>{reads++;return {name:'Test',likes:10};};ff.likeProvider=async()=>{calls++;throw Error('network')};
  const unchanged=await ff.attemptLikes('ME','123456789',{waitMs:0,secondWaitMs:0});
  assert.equal(calls,1);assert.equal(unchanged.status,'not-observed');assert.equal(unchanged.provider.ok,false);
  await assert.rejects(ff.attemptLikes('EU','123456789',{waitMs:0,secondWaitMs:0}),/UNSUPPORTED_REGION/);
  ff.info=async()=>{throw Error('offline')};let sent=0;ff.likeProvider=async()=>{sent++;return {ok:true,status:200};};
  await assert.rejects(ff.attemptLikes('ME','123456789',{waitMs:0,secondWaitMs:0}),/NO_BEFORE_COUNT/);assert.equal(sent,0);
 }finally{restore();ff.info=oldInfo;ff.likeProvider=oldProvider;}
});

test('like preview requires confirmation, reports only observed changes and never retries',async()=>{
 const old=ff.attemptLikes,restore=enableLikes();
 try{
  const disabled=context(['ME','123450006']);ff.LIKE_PROVIDER_VERIFIED=false;await like.run(disabled);assert.match(disabled.out[0],/No verified like provider/);ff.LIKE_PROVIDER_VERIFIED=true;
  let n=0;ff.attemptLikes=async()=>{n++;return {status:'observed',before:10,after:12,increase:2,name:'Test',provider:{ok:true,status:200,message:null}};};
  const c=context(['ME','123450001']);await prepare(c);assert.match(c.out[0],/no fixed 100 or 220/);assert.match(c.out[0],/account owner/);
  await like.run(c);assert.match(c.out.at(-1),/observed \+2/);assert.match(c.out.at(-1),/third-party result/);assert.equal(n,1);
  c.args=['ME','123450001'];await prepare(c);await like.run(c);assert.equal(n,1);assert.match(c.out.at(-1),/recently attempted/);
  ff.attemptLikes=async()=>({status:'not-observed',before:10,after:10,increase:0,provider:{ok:false,status:500,message:'provider error'}});
  const d=context(['ME','123450002']);await prepare(d);await like.run(d);assert.match(d.out.at(-1),/No like increase was observed/);assert.match(d.out.at(-1),/HTTP 500/);
  const unsupported=context(['EU','123450003']);await like.run(unsupported);assert.match(unsupported.out[0],/No verified like provider/);
 }finally{restore();ff.attemptLikes=old;}
});

test('duplicate concurrent likes are blocked across regions and destructive command is excluded from selftest',async()=>{
 const old=ff.attemptLikes,restore=enableLikes();let done;
 try{
  ff.attemptLikes=()=>new Promise(r=>{done=r});
  const a=context(['ME','123450004']),b=context(['BR','123450004']);b.sender='other@s.whatsapp.net';
  await prepare(a);await prepare(b);const p=like.run(a);await like.run(b);assert.match(b.out.at(-1),/already running/);
  done({status:'not-observed',before:10,after:10,increase:0,provider:{ok:false,status:500,message:null}});await p;assert.match(selftest.skip(like),/excluded/);
 }finally{restore();ff.attemptLikes=old;}
});

test('preview confirmation is scoped to sender and chat and expires',async()=>{
 const old=ff.attemptLikes,restore=enableLikes();
 try{
  let calls=0;ff.attemptLikes=async()=>{calls++;return {status:'not-observed',before:10,after:10,increase:0,provider:{ok:false,status:500,message:null}};};
  const a=context(['ME','123450005']);await prepare(a);const b=context(a.args);b.sender='other@s.whatsapp.net';await like.run(b);assert.match(b.out[0],/expired/);assert.equal(calls,0);
  a.args=['confirm','not-a-token'];await like.run(a);assert.match(a.out.at(-1),/expired/);assert.equal(calls,0);
 }finally{restore();ff.attemptLikes=old;}
});
