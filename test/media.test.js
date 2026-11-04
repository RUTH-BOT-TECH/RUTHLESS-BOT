const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {Image}=require('node-webpmux');
const media=require('../lib/media');
test('static sticker is 512 by 512 and carries pack metadata',async()=>{
 const png=await sharp({create:{width:60,height:40,channels:3,background:'red'}}).png().toBuffer();
 const webp=await media.stickerImage(png,'My Pack','My Author');
 const meta=await sharp(webp).metadata(); assert.equal(meta.width,512);assert.equal(meta.height,512);
 const i=new Image();await i.load(webp);assert.match(i.exif.toString(),/My Pack/);assert.match(i.exif.toString(),/My Author/);
 const changed=await media.withExif(webp,'Other','Artist');const r=new Image();await r.load(changed);assert.match(r.exif.toString(),/Other/);
});
test('media selection handles replied and captioned media',()=>{
 const m={key:{remoteJid:'g@g.us'},message:{imageMessage:{caption:'.sticker'}}};assert.equal(media.mediaInfo(media.sourceMessage(m)).type,'image');
 const quote={key:{remoteJid:'g@g.us'},message:{extendedTextMessage:{text:'.toimg',contextInfo:{stanzaId:'abc',participant:'1@s.whatsapp.net',quotedMessage:{stickerMessage:{mimetype:'image/webp'}}}}}};
 assert.equal(media.mediaInfo(media.sourceMessage(quote)).type,'sticker');assert.equal(media.sourceMessage(quote).key.id,'abc');
});
test('FFmpeg converts generated audio to MP3 and voice-note Ogg', {timeout:30000},async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruth-test-'));
 try {const wav=path.join(dir,'test.wav');await media.runFfmpeg(['-y','-f','lavfi','-i','sine=frequency=440:duration=0.5',wav]);const input=await fs.readFile(wav);
  const mp3=await media.convert(input,'mp3',['-vn','-c:a','libmp3lame']);assert.ok(mp3.length>100);
  const ogg=await media.convert(input,'ogg',['-vn','-c:a','libopus']);assert.equal(ogg.subarray(0,4).toString(),'OggS');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('text stickers render both static and animated WebP', {timeout:30000},async()=>{
 const t=require('../lib/text-sticker');const one=await t.render('Hello','ttp2');assert.equal((await sharp(one).metadata()).format,'webp');
 const anim=await t.animated('Hello');assert.ok((await sharp(anim,{animated:true}).metadata()).pages>1);
});
test('all profile effects render to real PNG',async()=>{
 const fx=require('../lib/imagefx');const input=await fx.fallback();
 for(const name of Object.keys(fx.effects)){const output=await fx.render(name,input,'TEST');assert.equal((await sharp(output).metadata()).format,'png',name);}
});
test('local background removal outputs an RGBA PNG', {timeout:30000},async()=>{
 const input=await sharp({create:{width:128,height:128,channels:3,background:'#ffffff'}}).png().toBuffer();
 const out=await require('../lib/removebg').removeBackground(input);const result=await sharp(out).metadata();assert.equal(result.format,'png');assert.equal(result.hasAlpha,true);
});
