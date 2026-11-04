const { createCanvas, loadImage }=require('@napi-rs/canvas');
const sharp=require('sharp');
const fs=require('node:fs/promises');
const path=require('node:path');
const effects={
 trigger:{aliases:['triggered'],label:'TRIGGERED'}, wasted:{aliases:[],label:'WASTED'}, wanted:{aliases:[],label:'WANTED'},
 jail:{aliases:[],label:'JAIL'}, rip:{aliases:[],label:'RIP'}, gay:{aliases:['rainbow'],label:'RAINBOW'},
 glitch:{aliases:[],label:'GLITCH'}, pixelate:{aliases:[],label:'PIXELATE'}, blurface:{aliases:[],label:'BLUR'},
 communism:{aliases:['comrade'],label:'COMRADE'}, deepfry:{aliases:[],label:'DEEP FRY'}, ad:{aliases:[],label:'ADVERTISEMENT'}
};
async function fallback() {
 try{return await fs.readFile(path.join(__dirname,'../assets/default-pfp.jpg'));}catch{}
 return sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ddd"/><circle cx="256" cy="185" r="100" fill="#999"/><path d="M64 490c0-125 86-182 192-182s192 57 192 182" fill="#999"/></svg>')).png().toBuffer();
}
async function getAvatar(sock,jid) {
 try {
  const raw=await sock.profilePictureUrl(jid,'image'), u=new URL(raw);
  if(u.protocol!=='https:' || !/(^|\.)(whatsapp\.net|fbcdn\.net)$/.test(u.hostname))throw Error('Untrusted picture host');
  const response=await fetch(u,{signal:AbortSignal.timeout(10000)});if(!response.ok || Number(response.headers.get('content-length')||0)>8*1024*1024)throw Error('Picture unavailable');
  const chunks=[];let size=0;for await(const part of response.body){size+=part.length;if(size>8*1024*1024)throw Error('Picture too large');chunks.push(Buffer.from(part));}return {buffer:Buffer.concat(chunks),fallback:false};
 }catch{return {buffer:await fallback(),fallback:true};}
}
function title(ctx,text,y,color='#fff',size=64) {ctx.font=`900 ${size}px sans-serif`;ctx.textAlign='center';ctx.lineWidth=7;ctx.strokeStyle='#111';ctx.strokeText(text,256,y,480);ctx.fillStyle=color;ctx.fillText(text,256,y,480);}
async function render(name, buffer, displayName='USER') {
 if(!effects[name])throw Error('Unknown image effect');
 let image=sharp(buffer,{limitInputPixels:40000000}).rotate().resize(512,512,{fit:'cover'});
 if(name==='wasted'||name==='jail'||name==='rip') image=image.grayscale();
 if(name==='wanted') image=image.recomb([[.393,.769,.189],[.349,.686,.168],[.272,.534,.131]]);
 if(name==='deepfry') image=image.modulate({saturation:2.5,brightness:1.1}).linear(1.3,-20).sharpen();
 if(name==='blurface') image=image.blur(20);
 if(name==='pixelate') {const small=await image.resize(24,24,{fit:'cover'}).png().toBuffer(); image=sharp(small).resize(512,512,{kernel:'nearest'});}
 const buf=await image.png().toBuffer(), img=await loadImage(buf), c=createCanvas(512,512),ctx=c.getContext('2d');ctx.drawImage(img,0,0,512,512);
 if(name==='trigger'){ctx.fillStyle='rgba(255,0,0,.30)';ctx.fillRect(0,0,512,512);ctx.fillStyle='#ff7900';ctx.fillRect(0,415,512,97);title(ctx,'TRIGGERED',484,'white',54);}
 if(name==='wasted'){ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(0,190,512,112);title(ctx,'WASTED',271,'#e02222',82);}
 if(name==='wanted'){ctx.strokeStyle='#6c3a15';ctx.lineWidth=25;ctx.strokeRect(12,12,488,488);ctx.fillStyle='rgba(245,220,163,.75)';ctx.fillRect(0,0,512,76);title(ctx,'WANTED',60,'#572d12',64);ctx.fillRect(0,432,512,80);title(ctx,'REWARD',489,'#572d12',47);}
 if(name==='jail') {ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,512,512);ctx.fillStyle='#555';for(let x=16;x<512;x+=86){ctx.fillRect(x+5,0,22,512);ctx.fillStyle='#c8d0d5';ctx.fillRect(x,0,16,512);ctx.fillStyle='#555';}ctx.fillRect(0,25,512,20);ctx.fillRect(0,463,512,20);}
 if(name==='rip'){ctx.fillStyle='rgba(5,5,5,.6)';ctx.fillRect(0,0,512,85);ctx.fillRect(0,415,512,97);title(ctx,'R.I.P.',65,'#fff',62);title(ctx,displayName.slice(0,24),478,'#fff',36);}
 if(name==='gay'){const colors=['#e6261f','#eb7532','#f7d038','#49b84d','#2687d8','#9336a7'];colors.forEach((v,i)=>{ctx.fillStyle=v;ctx.globalAlpha=.27;ctx.fillRect(0,i*512/6,512,512/6+1);});ctx.globalAlpha=1;}
 if(name==='glitch'){ctx.globalAlpha=.48;ctx.globalCompositeOperation='screen';ctx.drawImage(img,-14,0,512,512);ctx.drawImage(img,14,0,512,512);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';for(let y=65;y<450;y+=100){ctx.drawImage(c,0,y,490,12,15,y,490,12);}}
 if(name==='communism'){ctx.fillStyle='rgba(190,0,0,.48)';ctx.fillRect(0,0,512,512);title(ctx,'★',100,'#ffd21c',92);title(ctx,'☭',480,'#ffd21c',100);}
 if(name==='ad'){ctx.strokeStyle='#ffffff';ctx.lineWidth=28;ctx.strokeRect(14,14,484,484);ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(0,420,512,92);title(ctx,'ADVERTISEMENT',480,'white',40);}
 return c.toBuffer('image/png');
}
module.exports={effects,render,getAvatar,fallback};
