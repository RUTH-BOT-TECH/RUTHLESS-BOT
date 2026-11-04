'use strict';
// Constructed only after the trusted server has authenticated a token.
const crypto=require('node:crypto');
const VALID_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function checkId(id){if(typeof id!=='string'||!VALID_ID.test(id))throw Error('Invalid tenant');return id.toLowerCase();}
function field(key){if(typeof key!=='string'||!key||Buffer.byteLength(key)>600)throw Error('Invalid key');return Buffer.from(key).toString('base64url');}
function secretBytes(secret){if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('A private signing secret of at least 32 bytes is required');return Buffer.from(secret);}
function issueToken(secret,id,{expiresAt=Date.now()+365*86400000}={}){const sub=checkId(id),key=secretBytes(secret);if(!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now())throw Error('Invalid expiration');const payload=Buffer.from(JSON.stringify({sub,exp:expiresAt})).toString('base64url');const mac=crypto.createHmac('sha256',key).update(payload).digest('base64url');return `${payload}.${mac}`;}
function authenticate(secret,token,now=Date.now()){
 try{const key=secretBytes(secret);if(typeof token!=='string'||token.length>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token))return null;const [payload,sig]=token.split('.'),expected=crypto.createHmac('sha256',key).update(payload).digest(),actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const p=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));if(!Number.isSafeInteger(p.exp)||p.exp<=now)return null;return checkId(p.sub);}catch{return null;}
}
class TenantStore{
 #collection;#id;
 constructor(collection,id){this.#collection=collection;this.#id=checkId(id);}
 async getEntry(key){const f=field(key),doc=await this.#collection.findOne({_id:this.#id},{projection:{[`entries.${f}`]:1}});const found=!!doc?.entries&&Object.hasOwn(doc.entries,f);return {found,value:found?doc.entries[f]:null};}
 async get(key,fallback=null){const entry=await this.getEntry(key);return entry.found?entry.value:fallback;}
 async set(key,value){if(value===undefined)throw Error('Invalid value');await this.#collection.updateOne({_id:this.#id},{$set:{[`entries.${field(key)}`]:value}},{upsert:true});}
 async del(key){await this.#collection.updateOne({_id:this.#id},{$unset:{[`entries.${field(key)}`]:''}});}
 async list(prefix){if(typeof prefix!=='string'||Buffer.byteLength(prefix)>600)throw Error('Invalid prefix');const doc=await this.#collection.findOne({_id:this.#id},{projection:{entries:1}});return Object.entries(doc?.entries||{}).map(([k,v])=>[Buffer.from(k,'base64url').toString('utf8'),v]).filter(([k])=>k.startsWith(prefix));}
}
module.exports={TenantStore,issueToken,authenticate,checkId};
