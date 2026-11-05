'use strict';
const crypto=require('node:crypto'),{promisify}=require('node:util'),bcrypt=require('bcryptjs');
const scrypt=promisify(crypto.scrypt),random=crypto.randomBytes;let active=0;
const b64=b=>b.toString('base64url');
function decode(s,max){if(typeof s!=='string'||!s||s.length>max||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid encrypted data');const b=Buffer.from(s,'base64url');if(b64(b)!==s)throw Error('Invalid encrypted data');return b;}
function validPass(pass){return typeof pass==='string'&&Buffer.byteLength(pass)>=8&&Buffer.byteLength(pass)<=128;}
async function limited(fn){if(active>=2)throw Error('Busy');active++;try{return await fn();}finally{active--;}}
async function derive(pass,salt){return scrypt(pass,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});}
async function encrypt(pass,text){if(!validPass(pass)||typeof text!=='string'||!text||Buffer.byteLength(text)>1500)throw Error('Invalid input');return limited(async()=>{const salt=random(16),iv=random(12),key=await derive(pass,salt);try{const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('rmd1'));const ciphertext=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return ['rmd1',b64(salt),b64(iv),b64(cipher.getAuthTag()),b64(ciphertext)].join('$');}finally{key.fill(0);}});}
async function decrypt(pass,token){if(!validPass(pass)||typeof token!=='string'||token.length>2400)throw Error('Invalid input');const parts=token.split('$');if(parts.length!==5||parts[0]!=='rmd1')throw Error('Invalid encrypted data');const salt=decode(parts[1],24),iv=decode(parts[2],16),tag=decode(parts[3],22),ct=decode(parts[4],2100);if(salt.length!==16||iv.length!==12||tag.length!==16||ct.length>1500)throw Error('Invalid encrypted data');return limited(async()=>{const key=await derive(pass,salt);try{const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('rmd1'));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(ct),cipher.final()]).toString('utf8');}finally{key.fill(0);}});}
function password(s){return typeof s==='string'&&s.length>0&&Buffer.byteLength(s)<=72;}
async function hash(pass){if(!password(pass))throw Error('Password must be 1–72 UTF-8 bytes');return limited(()=>bcrypt.hash(pass,10));}
async function verify(pass,digest){if(!password(pass)||typeof digest!=='string'||!/^\$2[ab]\$(?:0[4-9]|1[012])\$[./A-Za-z0-9]{53}$/.test(digest))throw Error('Invalid input');return limited(()=>bcrypt.compare(pass,digest));}
function strength(s){if(typeof s!=='string'||!s||Buffer.byteLength(s)>256)throw Error('Invalid input');const n=[...s].length,groups=[/[a-z]/.test(s),/[A-Z]/.test(s),/[0-9]/.test(s),/[^A-Za-z0-9]/.test(s)].filter(Boolean).length;const common=/^(?:password|passw0rd|qwerty|123456|letmein|admin|iloveyou)/i.test(s)||/^(.)\1{3,}$/u.test(s);let label=n<12||common?'weak':n>=16&&groups>=3?'stronger':'moderate';return {length:n,groups,label};}
module.exports={encrypt,decrypt,hash,verify,strength,validPass};
