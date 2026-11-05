'use strict';
const sharp=require('sharp');
const themes={neon:{top:'#08051d',bottom:'#16113a',light:'#e9c9ff',mid:'#d25fff',accent:'#74e2ff',label:'NEON LIGHT'},glitchtext:{top:'#080b18',bottom:'#172433',light:'#ffffff',mid:'#f1f7ff',accent:'#00ebf3',label:'GLITCH MODE'},firetext:{top:'#190707',bottom:'#3d1010',light:'#fff8ad',mid:'#ff7c20',accent:'#ff3a18',label:'FIRE TYPE'},gold:{top:'#16100c',bottom:'#312313',light:'#fff3b8',mid:'#dfa42f',accent:'#e4c66e',label:'GOLD EDITION'},'3dtext':{top:'#0c1430',bottom:'#202655',light:'#e3eaff',mid:'#8fa5ff',accent:'#4c70d3',label:'DIMENSION'},logo:{top:'#091923',bottom:'#0b3840',light:'#e3fffb',mid:'#58e1c8',accent:'#50b7ad',label:'CUSTOM LOGOTYPE'},blackpink:{top:'#120e14',bottom:'#29121d',light:'#ffe0eb',mid:'#ff95b8',accent:'#eb75a0',label:'PINK / BLACK'},hacker:{top:'#05130d',bottom:'#07281b',light:'#d3ffe2',mid:'#4ef195',accent:'#36b974',label:'TERMINAL MODE'},matrix:{top:'#020f08',bottom:'#082313',light:'#d2ffcb',mid:'#38f17b',accent:'#28bb64',label:'DIGITAL RAIN'}};
// Simple local graphic styles inspired by each name; not photorealistic material effects.
const additional={
 water:['#061b32','#10456a','#e8ffff','#37aada','#72dbef','WATER'],
 ice:['#102a39','#356981','#ffffff','#9de9ff','#c3f3ff','ICE'],
 snow:['#26364a','#668399','#ffffff','#e0f5ff','#f5ffff','SNOW'],
 silver:['#14171e','#353c48','#ffffff','#b9c6d3','#ecf3fa','SILVER'],
 bronze:['#1f100d','#502b1c','#ffe0ad','#c97d47','#e9aa75','BRONZE'],
 diamond:['#121a35','#315279','#ffffff','#b2edff','#cdefff','DIAMOND'],
 chrome:['#12151f','#393b4d','#ffffff','#9caec3','#dbe9ff','CHROME'],
 metal:['#11151b','#36434a','#fbffff','#93aeb2','#c8dcdd','METAL'],
 '3dgold':['#16100c','#312313','#fff3b8','#dfa42f','#e4c66e','3D GOLD'],
 '3dsilver':['#14171e','#353c48','#ffffff','#b9c6d3','#ecf3fa','3D SILVER'],
 '3dneon':['#08051d','#16113a','#e9c9ff','#d25fff','#74e2ff','3D NEON'],
 pink:['#2b0c20','#641c45','#fff1f7','#ff89c0','#ffb6da','PINK'],
 purple:['#1c0b35','#4b1e77','#f9eaff','#be86ff','#d6acff','PURPLE'],
 blue:['#071c3e','#104584','#edf9ff','#6cc7ff','#89dcff','BLUE'],
 green:['#082a1a','#145d34','#eaffed','#65dd86','#9ff1a9','GREEN'],
 red:['#2c090e','#761b23','#fff1ed','#ff7970','#ffaba0','RED'],
 yellow:['#352606','#755313','#fffbd7','#ffdd47','#ffe98d','YELLOW'],
 orange:['#361707','#7b3a10','#fff2d6','#ffad43','#ffc66f','ORANGE'],
 'rainbow-text':['#141029','#292354','#ffffff','#ff77b5','#8cefff','RAINBOW'],
 graffiti:['#171329','#47295b','#fff9e4','#fd8a66','#a9edff','GRAFFITI'],
 graffiti2:['#061f27','#265f5a','#faffc9','#68ebbf','#ffd058','STREET ART'],
 'cartoon-text':['#312348','#745589','#fff8d9','#ffce57','#ff9ca8','CARTOON'],
 comic:['#2a1b3c','#69415d','#fffde3','#ffd550','#ff7286','COMIC'],
 candy:['#361329','#74325d','#fff2ff','#ff8bca','#abf2ff','CANDY'],
 chocolate:['#24110c','#56301f','#ffeed4','#c89468','#f0be91','CHOCOLATE'],
 cake:['#472037','#805068','#fff8eb','#ffc2d2','#ffe0ad','CAKE'],
 sand:['#34240f','#76582f','#fff6d2','#e9c27e','#f6dea8','SAND'],
 wood:['#22150e','#5c3823','#ffedd5','#bf8751','#dfad78','WOOD'],
 stone:['#22282a','#53615e','#f2fff7','#a8bdb4','#d4e4d8','STONE'],
 marble:['#25323c','#687b86','#ffffff','#d0e4e8','#f0fbfa','MARBLE'],
 paper:['#4e4131','#8a785f','#fffdf1','#e7d5af','#fff2cf','PAPER'],
 cloud:['#263c5d','#6782a2','#ffffff','#d0e8ff','#f0f9ff','CLOUD'],
 lightning:['#131439','#323878','#ffffff','#ffe267','#a6bbff','LIGHTNING'],
 thunder:['#16182a','#454963','#ffffff','#aaaeea','#fce46c','THUNDER'],
 horror:['#1d090e','#441821','#fff0ee','#c56371','#ed8d92','HORROR'],
 blood:['#220509','#520a10','#ffd9d2','#d72c3b','#ff6673','BLOOD'],
 zombie:['#152218','#344830','#eeffd2','#9cc95f','#cfed93','ZOMBIE'],
 skull:['#171722','#383947','#f6f3e9','#c2c1b6','#f2efdc','SKULL'],
 gaming:['#091626','#173d58','#e8ffff','#58d0ec','#b9a8ff','GAMING'],
 esport:['#1a132a','#3b2452','#fff3f7','#ec67b6','#71dbfb','ESPORT']
};
for(const [name,[top,bottom,light,mid,accent,label]] of Object.entries(additional))themes[name]={top,bottom,light,mid,accent,label,depth:name.startsWith('3d')};
function escape(v){return String(v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[x]));}
function lines(text){const chars=Array.from(text.trim());if(chars.length<=32)return[chars.join('')];const middle=Math.ceil(chars.length/2);let split=middle;for(let distance=0;distance<12;distance++){const candidates=[middle-distance,middle+distance];const found=candidates.find(i=>i>0&&i<chars.length&&chars[i]===' '&&i<=45&&chars.length-i<=45);if(found!==undefined){split=found;break;}}return [chars.slice(0,split).join('').trim(),chars.slice(split).join('').trim()].filter(Boolean);}
function svg(name,text){const t=themes[name];if(!t)throw Error('Unknown text style');if(typeof text!=='string'||!text.trim()||[...text].length>80||/[\x00-\x1f\x7f]/.test(text))throw Error('Text must be 1–80 characters');const chunks=lines(text),long=Math.max(...chunks.map(v=>Array.from(v).length)),size=Math.max(28,Math.min(112,Math.floor(850/(long*.7||1)))),y=chunks.length===1?263:225,stroke=name==='glitchtext'?`<text x="604" y="${y+3}" class="headline" fill="#ff4089" opacity=".75">${escape(chunks[0])}</text><text x="596" y="${y-3}" class="headline" fill="#00e5f3" opacity=".7">${escape(chunks[0])}</text>`:'';
 const headline=chunks.map((line,i)=>{const yy=y+i*(size+18),extrusion=(name==='3dtext'||t.depth)?Array.from({length:8},(_,j)=>`<text x="${608-j}" y="${yy+8-j}" class="headline" fill="${t.depth?t.accent:'#283b89'}">${escape(line)}</text>`).join(''):'';return `${extrusion}<text x="600" y="${yy}" class="headline" fill="url(#ink)" ${name==='neon'?'filter="url(#glow)"':''}>${escape(line)}</text>`;}).join('');
 const strips=name==='matrix'||name==='hacker'?Array.from({length:14},(_,i)=>`<text x="${30+i*88}" y="65" fill="${t.accent}" opacity=".1" font-family="monospace" font-size="15">${(i*7%10)} 0 1 0 1</text><text x="${24+i*88}" y="390" fill="${t.accent}" opacity=".12" font-family="monospace" font-size="15">0 1 ${i%10} 0 1</text>`).join(''):'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480" viewBox="0 0 1200 480"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${t.top}"/><stop offset="1" stop-color="${t.bottom}"/></linearGradient><linearGradient id="ink" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${t.light}"/>${name==='rainbow-text'?'<stop offset=".2" stop-color="#ff5668"/><stop offset=".4" stop-color="#ffda54"/><stop offset=".6" stop-color="#63e398"/><stop offset=".8" stop-color="#65bbff"/>':''}<stop offset="1" stop-color="${t.mid}"/></linearGradient><radialGradient id="halo"><stop stop-color="${t.accent}" stop-opacity=".20"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient><filter id="glow" x="-.4" width="1.8" y="-.8" height="2.6"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><style>.headline{font-family:DejaVu Sans,sans-serif;font-weight:900;font-size:${size}px;text-anchor:middle;letter-spacing:1px}</style></defs><rect width="1200" height="480" fill="url(#bg)"/><ellipse cx="600" cy="240" rx="560" ry="245" fill="url(#halo)"/><rect x="30" y="30" width="1140" height="420" rx="20" fill="none" stroke="${t.accent}" opacity=".32"/><path d="M65 112 H310 M890 112 H1135 M65 370 H310 M890 370 H1135" fill="none" stroke="${t.accent}" opacity=".4" stroke-width="2"/>${strips}<text x="600" y="93" text-anchor="middle" fill="${t.accent}" font-family="DejaVu Sans,sans-serif" font-weight="bold" font-size="17" letter-spacing="6">${t.label}</text>${stroke}${headline}<text x="600" y="421" text-anchor="middle" fill="${t.light}" opacity=".55" font-family="DejaVu Sans,sans-serif" font-size="15" letter-spacing="4">RUTHLESS MD · LOCAL TEXT ART</text></svg>`;}
async function render(name,text){return sharp(Buffer.from(svg(name,text)),{limitInputPixels:1000000}).png().toBuffer();}
module.exports={themes,svg,render};
