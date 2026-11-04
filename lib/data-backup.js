'use strict';
const zlib=require('node:zlib'),{promisify}=require('node:util');
const {prepare,DEFAULT_CAP}=require('./backup-cleanup');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip),MAX_UNCOMPRESSED=20*1024*1024;
async function unpack(data){if(!Buffer.isBuffer(data)||data.length>DEFAULT_CAP)throw Error('Invalid backup');const raw=await gunzip(data,{maxOutputLength:MAX_UNCOMPRESSED});const parsed=JSON.parse(raw.toString('utf8'));if(!parsed||parsed.version!==1||!parsed.entries||typeof parsed.entries!=='object'||Array.isArray(parsed.entries)||Object.keys(parsed.entries).some(k=>k.startsWith('auth:')||['__proto__','prototype','constructor'].includes(k)))throw Error('Invalid backup');return parsed.entries;}
class DataBackup{
 constructor(db,client,{clearCache=()=>{},notify=async()=>{}}={}){this.db=db;this.client=client;this.clearCache=clearCache;this.notify=notify;this.version=undefined;this.timer=null;this.queue=Promise.resolve();this.pending=false;this.notified=false;this.closed=false;}
 async fail(){this.db.lastError='BACKUP_FAILED';this.pending=true;await this.notifyPending();}
 async notifyPending(){if(!this.pending||this.notified)return;try{if(await this.notify('⚠️ Settings backup failed. Your important data was not deleted. Check the pairing service and storage limit.'))this.notified=true;}catch{}}
 async remote(){try{return await this.client.getBackup();}catch(e){if(e.status===404)return null;throw e;}}
 async start(){const localTime=this.db.settingsModifiedAt||0;try{const remote=await this.remote();this.version=remote?.version||0;const localEntries=Object.keys(this.db.data).filter(k=>!k.startsWith('auth:'));if(remote&&(!localEntries.length||Date.parse(remote.updatedAt)>localTime)){const entries=await unpack(Buffer.from(remote.data,'base64'));await this.db.replaceSettings(entries,Date.parse(remote.updatedAt));} }catch{await this.fail();}this.db.onChange=()=>this.changed();}
 changed(){if(this.closed||this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.backup().catch(()=>{});},30000);this.timer.unref();}
 async backup(){this.queue=this.queue.catch(()=>{}).then(async()=>{try{
  this.clearCache();let original=Object.fromEntries((await this.db.list('')).filter(([key])=>!key.startsWith('auth:')));let cleaned=prepare(original);
  // Only delete recognized expired data if it has not changed since the snapshot.
  for(const [key,value] of Object.entries(original)){if(!Object.hasOwn(cleaned.entries,key))await this.db.compareLocal(key,value,null,true);else if(JSON.stringify(value)!==JSON.stringify(cleaned.entries[key]))await this.db.compareLocal(key,value,cleaned.entries[key]);}
  original=Object.fromEntries((await this.db.list('')).filter(([key])=>!key.startsWith('auth:')));cleaned=prepare(original);if(!cleaned.withinLimit)throw Error('Backup exceeds 10 MiB');
  const payload=await gzip(Buffer.from(JSON.stringify({version:1,entries:cleaned.entries})));if(payload.length>DEFAULT_CAP)throw Error('Backup exceeds 10 MiB');
  if(this.version===undefined){const remote=await this.remote();this.version=remote?.version||0;}
  const result=await this.client.saveBackup(this.version,payload);if(!Number.isSafeInteger(result.version)||result.version<=this.version)throw Error('Invalid backup response');this.version=result.version;this.pending=false;this.notified=false;if(this.db.lastError==='BACKUP_FAILED')this.db.lastError=null;return {bytes:payload.length,removed:cleaned.removed};
 }catch(e){await this.fail();throw e;}});return this.queue;}
 async restore(){const remote=await this.remote();if(!remote)throw Error('No backup found');const entries=await unpack(Buffer.from(remote.data,'base64'));await this.db.replaceSettings(entries,Date.parse(remote.updatedAt));this.version=remote.version;return Object.keys(entries).length;}
 async close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.db.onChange=null;await this.backup();}
}
module.exports={DataBackup,unpack};
