'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadCommands}=require('../lib/loader');
const dl=require('../lib/downloader'), media=require('../lib/media');
function context(args=[]){const out=[];return {args,invoked:'',sender:'2348011111111@s.whatsapp.net',chat:'2348022222222@s.whatsapp.net',msg:{},box:x=>x,reply:async text=>out.push({text}),sock:{sendMessage:async(_jid,payload)=>out.push(payload)},markReplied(){},out};}

test('quick catalog lookups send one result or one error, retaining attribution',async()=>{
 const old=global.fetch,oldSearch=dl.searchYoutube,c=loadCommands();
 try{
  global.fetch=async()=>Response.json({results:[{artistName:'Fela',trackName:'Water',trackViewUrl:'https://music.apple.com/'}]});
  let ctx=context(['Fela']);await c.get('spotifysearch').run(ctx);assert.equal(ctx.out.length,1);assert.match(ctx.out[0].text,/iTunes Search API/);
  global.fetch=async()=>new Response('',{status:500});ctx=context(['Fela']);await c.get('spotifysearch').run(ctx);assert.equal(ctx.out.length,1);assert.match(ctx.out[0].text,/unavailable/);
  dl.searchYoutube=async()=>[{title:'Video',url:'https://youtube.com/watch?v=123'}];ctx=context(['Video']);await c.get('yts').run(ctx);assert.equal(ctx.out.length,1);assert.match(ctx.out[0].text,/YouTube results/);
 }finally{global.fetch=old;dl.searchYoutube=oldSearch;}
});

test('music match keeps actual preview and exact fallback attribution without duplicate status replies',async()=>{
 const oldFetch=global.fetch,oldSearch=dl.searchYoutube,oldDownload=dl.download,oldConvert=media.convert,c=loadCommands();
 try{
  global.fetch=async raw=>{const u=new URL(raw);if(u.hostname==='open.spotify.com')return new Response('<meta property="og:title" content="Water"><meta name="music:musician_description" content="Fela">');if(u.hostname==='itunes.apple.com')return Response.json({results:[{trackName:'Water',artistName:'Fela',previewUrl:'https://audio.itunes.apple.com/preview'}]});if(u.hostname==='audio.itunes.apple.com')return new Response(Buffer.from('preview'));throw Error('Unexpected URL');};
  dl.searchYoutube=async()=>[{title:'Fela Water official',url:'https://youtube.com/watch?v=abc'}];
  dl.download=async()=>({data:Buffer.from('full'),ext:'mp3',title:'Fela Water official',source:'fallback provider example'});
  media.convert=async()=>Buffer.from('preview');
  const ctx=context(['https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl']);await c.get('spotify').run(ctx);
  assert.equal(ctx.out.length,3);assert.equal(ctx.out[0].audio.toString(),'preview');assert.equal(ctx.out[1].audio.toString(),'full');assert.match(ctx.out[2].text,/fallback provider example/);assert.match(ctx.out[2].text,/first audio was an iTunes preview/);assert.match(ctx.out[2].text,/may differ from the original/);
  dl.searchYoutube=async()=>[];const missing=context(['https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl']);await c.get('spotify').run(missing);assert.equal(missing.out.length,2);assert.match(missing.out[1].text,/audio above was a short iTunes preview/);
 }finally{global.fetch=oldFetch;dl.searchYoutube=oldSearch;dl.download=oldDownload;media.convert=oldConvert;}
});
test('quick image and text-sticker commands send one result, keeping illustration safety information',async()=>{
 const sharp=require('sharp'),pictures=require('../lib/anime-images'),renderer=require('../lib/text-sticker'),c=loadCommands();
 const old={image:pictures.image,render:renderer.render,sourceMessage:media.sourceMessage,mediaInfo:media.mediaInfo,download:media.download};
 try{
  const png=await sharp({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer();
  pictures.image=async()=>({buffer:png,artist:'Artist'});let ctx=context();await c.get('waifu').run(ctx);assert.equal(ctx.out.length,1);assert.ok(ctx.out[0].image);assert.match(ctx.out[0].caption,/classification can be imperfect/);assert.match(ctx.out[0].caption,/Nekosia/);
  renderer.render=async()=>Buffer.from('sticker');ctx=context(['Hello']);await c.get('ttp').run(ctx);assert.equal(ctx.out.length,1);assert.ok(ctx.out[0].sticker);
  media.sourceMessage=()=>({});media.mediaInfo=()=>({type:'image',data:{}});media.download=async()=>png;ctx=context();ctx.invoked='blur';await c.get('blur').run(ctx);assert.equal(ctx.out.length,1);assert.ok(ctx.out[0].image);
 }finally{pictures.image=old.image;renderer.render=old.render;media.sourceMessage=old.sourceMessage;media.mediaInfo=old.mediaInfo;media.download=old.download;}
});
