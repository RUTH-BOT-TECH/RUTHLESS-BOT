'use strict';
const zlib=require('node:zlib'),{promisify}=require('node:util');
const {prepare,DEFAULT_CAP}=require('./backup-cleanup');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip),MAX_UNCOMPRESSED=20*1024*1024;
async function unpack(data){if(!Buffer.isBuffer(data)||data.length>DEFAULT_CAP)throw Error('Invalid backup');const raw=await gunzip(data,{maxOutputLength:MAX_UNCOMPRESSED});const parsed=JSON.parse(raw.toString('utf8'));if(!parsed||parsed.version!==1||!parsed.entries||typeof parsed.entries!=='object'||Array.isArray(parsed.entries)||Object.keys(parsed.entries).some(k=>k.startsWith('auth:')||['__proto__','prototype','constructor'].includes(k)))throw Error('Invalid backup');return parsed.entries;}
class DataBackup{
 constructor(db,client,{clearCache=()=>{},notify=async()=>{},retryMs=60000}={}){this.db=db;this.client=client;this.clearCache=clearCache;this.notify=notify;this.retryMs=retryMs;this.version=undefined;this.initialized=false;this.dirtyBeforeInit=false;this.timer=null;this.queue=Promise.resolve();this.pending=false;this.notified=false;this.closed=false;}
 async fail(){this.db.lastError='BACKUP_FAILED';this.pending=true;this.schedule(this.retryMs);await this.notifyPending();}
 async notifyPending(){if(!this.pending||this.notified)return;try{if(await this.notify('⚠️ Settings backup failed. Local data was not deleted. Check the pairing service, storage limit, or a startup backup conflict. Do not use restore unless you intend to replace local settings.'))this.notified=true;}catch{}}
 async remote(){try{return await this.client.getBackup();}catch(e){if(e.status===404)return null;throw e;}}
 async initialize(){
  const localTime=this.db.settingsModifiedAt||0,remote=await this.remote();
  if(remote&&(!Number.isSafeInteger(remote.version)||remote.version<1||!Number.isFinite(Date.parse(remote.updatedAt))))throw Error('Invalid backup metadata');
  // A failed startup fetch followed by local writes can leave two independent versions.
  // Never overwrite either version automatically in that case.
  if(remote&&this.dirtyBeforeInit)throw Error('Backup conflict: local settings changed before remote backup was checked');
  const localEntries=Object.keys(this.db.data).filter(k=>!k.startsWith('auth:'));
  if(remote&&(!localEntries.length||Date.parse(remote.updatedAt)>localTime)){
   const entries=await unpack(Buffer.from(remote.data,'base64'));
   if(this.dirtyBeforeInit)throw Error('Backup conflict: local settings changed during restore');
   await this.db.replaceSettings(entries,Date.parse(remote.updatedAt));
  }
  this.version=remote?.version||0;this.initialized=true;
 }
 async start(){this.db.onChange=()=>this.changed();try{await this.initialize();}catch{await this.fail();}}
 schedule(delay){if(this.closed||this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.backup().catch(()=>{});},delay);this.timer.unref();}
 changed(){if(!this.initialized)this.dirtyBeforeInit=true;this.schedule(30000);}
 async backup(){this.queue=this.queue.catch(()=>{}).then(async()=>{try{
  if(!this.initialized)await this.initialize();
  this.clearCache();let original=Object.fromEntries((await this.db.list('')).filter(([key])=>!key.startsWith('auth:')));let cleaned=prepare(original);
  // Only delete recognized expired data if it has not changed since the snapshot.
  for(const [key,value] of Object.entries(original)){if(!Object.hasOwn(cleaned.entries,key))await this.db.compareLocal(key,value,null,true);else if(JSON.stringify(value)!==JSON.stringify(cleaned.entries[key]))await this.db.compareLocal(key,value,cleaned.entries[key]);}
  original=Object.fromEntries((await this.db.list('')).filter(([key])=>!key.startsWith('auth:')));cleaned=prepare(original);if(!cleaned.withinLimit)throw Error('Backup exceeds 10 MiB');
  const payload=await gzip(Buffer.from(JSON.stringify({version:1,entries:cleaned.entries})));if(payload.length>DEFAULT_CAP)throw Error('Backup exceeds 10 MiB');
  if(this.version===undefined){const remote=await this.remote();this.version=remote?.version||0;}
  const result=await this.client.saveBackup(this.version,payload);if(!Number.isSafeInteger(result.version)||result.version<=this.version)throw Error('Invalid backup response');this.version=result.version;this.pending=false;this.notified=false;if(this.db.lastError==='BACKUP_FAILED')this.db.lastError=null;return {bytes:payload.length,removed:cleaned.removed};
 }catch(e){await this.fail();throw e;}});return this.queue;}
 async restore(){this.queue=this.queue.catch(()=>{}).then(async()=>{const remote=await this.remote();if(!remote||!Number.isSafeInteger(remote.version)||remote.version<1||!Number.isFinite(Date.parse(remote.updatedAt)))throw Error('No valid backup found');const entries=await unpack(Buffer.from(remote.data,'base64'));await this.db.replaceSettings(entries,Date.parse(remote.updatedAt));this.version=remote.version;this.initialized=true;this.dirtyBeforeInit=false;this.pending=false;this.notified=false;if(this.db.lastError==='BACKUP_FAILED')this.db.lastError=null;return Object.keys(entries).length;});return this.queue;}
 async close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.db.onChange=null;await this.backup();}
}
module.exports={DataBackup,unpack};
