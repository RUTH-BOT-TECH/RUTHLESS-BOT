'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const pino=require('pino');
const {generateWAMessageContent}=require('@whiskeysockets/baileys');
const media=require('../lib/media');
const {Image}=require('node-webpmux');
test('Baileys rc14 preserves animated flag when preparing a renamed animated WebP sticker', {timeout:30000},async()=>{
 const original=await require('../lib/text-sticker').animated('Hi');
 const renamed=await media.withExif(original,'Ruth','If you can steal it 😹');
 const im=new Image();await im.load(renamed);assert.equal(im.hasAnim,true);
 const payload=await generateWAMessageContent({sticker:renamed,isAnimated:true},{logger:pino({level:'silent'}),upload:async()=>({mediaUrl:'https://example.invalid/file',directPath:'/fake'}),options:{}});
 assert.equal(payload.stickerMessage.isAnimated,true);assert.equal(payload.stickerMessage.mimetype,'image/webp');
});
