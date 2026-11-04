'use strict';
const crypto=require('node:crypto');
const SECRET=/^[A-Za-z0-9_-]{43}$/;
function dataKey(value){if(typeof value!=='string'||!/^[0-9a-fA-F]{64}$/.test(value))throw Error('DATA_KEY must be exactly 64 hexadecimal characters');return Buffer.from(value,'hex');}
function hash(secret){if(typeof secret!=='string'||!SECRET.test(secret))throw Error('Invalid token');return crypto.createHash('sha256').update(secret).digest('hex');}
function identity(secret){const h=hash(secret);return {id:h.slice(0,32),secretHash:h};}
function publicOrigin(value){let u;try{u=new URL(value);}catch{throw Error('PAIRING_SITE_URL must be a valid HTTPS origin');}if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('PAIRING_SITE_URL must be a valid HTTPS origin');return u.origin;}
function generateId(origin){const secret=crypto.randomBytes(32).toString('base64url'),{id}=identity(secret);const route=origin?'.'+Buffer.from(publicOrigin(origin)).toString('base64url'):'';return {id,secret,sessionId:`RUTHLESS~${id}${route}~${secret}`};}
function encrypt(key,id,purpose,plaintext){if(!Buffer.isBuffer(plaintext))throw Error('Invalid data');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(`ruthless:${id}:${purpose}:v1`));const data=Buffer.concat([cipher.update(plaintext),cipher.final()]);return {iv,tag:cipher.getAuthTag(),data};}
function bytes(data){if(Buffer.isBuffer(data))return data;if(data && typeof data.value==='function')return data.value(true);throw Error('Invalid encrypted data');}
function decrypt(key,id,purpose,encrypted){const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes(encrypted.iv));decipher.setAAD(Buffer.from(`ruthless:${id}:${purpose}:v1`));decipher.setAuthTag(bytes(encrypted.tag));return Buffer.concat([decipher.update(bytes(encrypted.data)),decipher.final()]);}
function phoneHash(key,phone,salt){if(typeof salt!=='string'||!/^[a-f0-9]{32}$/.test(salt))throw Error('Invalid phone salt');return crypto.createHmac('sha256',key).update('ruthless-phone-v1\0').update(salt).update('\0').update(phone).digest('hex');}
module.exports={dataKey,identity,generateId,encrypt,decrypt,phoneHash,publicOrigin};
