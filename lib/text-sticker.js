const {createCanvas}=require('@napi-rs/canvas');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const media=require('./media');
const config=require('../config');
const styles={ttp:{bg:'#111827',fg:'#ffffff',stroke:'#000000'},ttp2:{bg:'#fff4c2',fg:'#b91c1c',stroke:'#ffffff'},ttp3:{bg:'#002d4d',fg:'#5eeaff',stroke:'#00111d'},ttp4:{bg:'#270044',fg:'#fa75fc',stroke:'#ffffff'},ttp5:{bg:'#084a2a',fg:'#ffdc42',stroke:'#001b10'}};
function frame(text,style) {
 const canvas=createCanvas(512,512),ctx=canvas.getContext('2d');ctx.fillStyle=style.bg;ctx.fillRect(0,0,512,512);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 75px sans-serif';ctx.lineWidth=7;ctx.lineJoin='round';ctx.strokeStyle=style.stroke;ctx.fillStyle=style.fg;
 const words=text.split(/\s+/),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>460 && line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
 if(lines.length>5)throw Error('Text too long');
 const height=Math.min(78,370/lines.length);ctx.font=`bold ${Math.floor(height*.9)}px sans-serif`;
 lines.forEach((l,i)=>{const y=256+(i-(lines.length-1)/2)*height;ctx.strokeText(l,256,y,460);ctx.fillText(l,256,y,460);});
 return canvas.toBuffer('image/png');
}
async function render(text,style='ttp') {return media.stickerImage(frame(text,styles[style]),config.stickerPack,config.stickerAuthor);}
async function animated(text) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-ttp-'));
 try {
  for(let i=0;i<8;i++) {const hue=Math.round(i*360/8);const color=`hsl(${hue}, 85%, 58%)`;await fs.writeFile(path.join(dir,`frame-${String(i).padStart(2,'0')}.png`),frame(text,{bg:'#101018',fg:color,stroke:'#ffffff'}));}
  const out=path.join(dir,'output.webp');await media.runFfmpeg(['-y','-framerate','4','-i',path.join(dir,'frame-%02d.png'),'-c:v','libwebp','-loop','0','-quality','75',out]);
  const data=await fs.readFile(out);if(data.length>media.LIMIT)throw Error('Media exceeds 50 MB');return media.withExif(data,config.stickerPack,config.stickerAuthor);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={styles,frame,render,animated};
