const fs = require('node:fs/promises');
const path = require('node:path');
const { MongoClient } = require('mongodb');

// Key-value documents keep authentication updates separate from bot data.
class Database {
  constructor(url, file = path.join(__dirname, '../database/data.json'), options = {}) {
    this.url = url; this.file = file; this.data = {}; this.queue = Promise.resolve(); this.serviceUrl=options.serviceUrl||''; this.serviceToken=options.serviceToken||''; this.allowDirectMongo=options.allowDirectMongo===true; this.onChange=null; this.tenantId=options.tenantId || null; this.directStore=null; this.settingsModifiedAt=0;
  }
  async remote(op,body) {
    const response=await fetch(new URL(`/v1/${op}`,this.serviceUrl),{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${this.serviceToken}`},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok){await response.body?.cancel();throw Error('Trusted data service unavailable or access denied');}const {boundedBody}=require('./public-files');return JSON.parse((await boundedBody(response,10*1024*1024)).toString('utf8'));
  }
  async connect() {
    if (this.serviceUrl) {
      const u=new URL(this.serviceUrl);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))||!this.serviceToken)throw Error('Use a trusted HTTPS data-service URL and tenant token');
      await this.remote('get',{key:'__connection_check__'});
    } else if (this.url) {
      if(!this.allowDirectMongo)throw Error('Direct MongoDB is disabled. Use the trusted data service; legacy direct access is for isolated single-deployer databases only.');
      this.client = new MongoClient(this.url, { serverSelectionTimeoutMS: 10000 });
      await this.client.connect();
      this.collection = this.client.db().collection('ruthless_state');
      if (!this.tenantId) throw Error('A deployer ID is required for direct MongoDB storage');
      this.directStore = new (require('./tenant-store').TenantStore)(this.collection,this.tenantId);
      console.warn('Direct MongoDB is only safe with a private, isolated database.');
    } else {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      try { this.data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      try { const meta=JSON.parse(await fs.readFile(`${this.file}.settings-meta`,'utf8')); if(Number.isFinite(meta.modifiedAt))this.settingsModifiedAt=meta.modifiedAt; } catch(e) { if(e.code!=='ENOENT' && !(e instanceof SyntaxError))throw e; try {this.settingsModifiedAt=(await fs.stat(this.file)).mtimeMs;} catch(err) {if(err.code!=='ENOENT')throw err;} }
      console.warn('Local JSON storage is not durable on ephemeral hosts. Set DATABASE_URL for production.');
    }
    return this;
  }
  async get(key, fallback = null) {
    if (this.serviceUrl) {const result=await this.remote('get',{key});return result.found?result.value:fallback;}
    if (this.directStore) return this.directStore.get(key, fallback);
    return Object.hasOwn(this.data, key) ? structuredClone(this.data[key]) : fallback;
  }
  async set(key, value) {
    if (this.serviceUrl) {await this.remote('set',{key,value});return;}
    if (this.directStore) return this.directStore.set(key,value);
    this.data[key] = structuredClone(value);
    if (!key.startsWith('auth:')) { this.settingsModifiedAt=Date.now(); this.onChange?.(); }
    this.queue = this.queue.then(async () => {
      const temp = `${this.file}.tmp`;
      await fs.writeFile(temp, JSON.stringify(this.data), { mode: 0o600 });
      await fs.rename(temp, this.file);
      await fs.writeFile(`${this.file}.settings-meta`,JSON.stringify({modifiedAt:this.settingsModifiedAt}),{mode:0o600});
    });
    return this.queue;
  }
  async del(key) {
    if (this.serviceUrl) {await this.remote('delete',{key});return;}
    if (this.directStore) return this.directStore.del(key);
    delete this.data[key];
    if (!key.startsWith('auth:')) { this.settingsModifiedAt=Date.now(); this.onChange?.(); }
    this.queue = this.queue.then(async () => { const t = `${this.file}.tmp`; await fs.writeFile(t, JSON.stringify(this.data), { mode: 0o600 }); await fs.rename(t, this.file); await fs.writeFile(`${this.file}.settings-meta`,JSON.stringify({modifiedAt:this.settingsModifiedAt}),{mode:0o600}); });
    return this.queue;
  }
  async list(prefix) {
    if (this.serviceUrl) {const data=await this.remote('list',{prefix});return data.entries;}
    if (this.directStore) return this.directStore.list(prefix);
    return Object.entries(this.data).filter(([k]) => k.startsWith(prefix));
  }
  async replaceSettings(entries, modifiedAt = Date.now()) {
    if (this.collection || this.serviceUrl || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('Local settings required');
    const next = {};
    for (const [key, value] of Object.entries(this.data)) if (key.startsWith('auth:')) next[key] = value;
    for (const [key, value] of Object.entries(entries)) {
      if (key.startsWith('auth:') || ['__proto__','prototype','constructor'].includes(key)) throw Error('Invalid backup entry');
      next[key] = structuredClone(value);
    }
    if (!Number.isFinite(modifiedAt)) throw Error('Invalid settings timestamp');
    this.data = next; this.settingsModifiedAt=modifiedAt;
    this.queue = this.queue.then(async () => { const temp = `${this.file}.tmp`; await fs.writeFile(temp, JSON.stringify(this.data), {mode:0o600}); await fs.rename(temp,this.file); await fs.writeFile(`${this.file}.settings-meta`,JSON.stringify({modifiedAt:this.settingsModifiedAt}),{mode:0o600}); });
    return this.queue;
  }
  async compareLocal(key, expected, replacement, remove = false) {
    if (this.collection || this.serviceUrl) throw Error('Local settings required');
    if (!Object.hasOwn(this.data, key) || JSON.stringify(this.data[key]) !== JSON.stringify(expected)) return false;
    if (remove) await this.del(key); else await this.set(key,replacement);
    return true;
  }
  async close() { await this.queue; if (this.client) await this.client.close(); }
}
// Pure, non-destructive preparation for the future backup command.
Database.prepareBackup = require('./backup-cleanup').prepare;
Database.BACKUP_CAP = require('./backup-cleanup').DEFAULT_CAP;
module.exports = Database;
