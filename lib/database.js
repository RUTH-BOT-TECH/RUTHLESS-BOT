const fs = require('node:fs/promises');
const path = require('node:path');
const { MongoClient } = require('mongodb');

// Key-value documents keep authentication updates separate from bot data.
class Database {
  constructor(url, file = path.join(__dirname, '../database/data.json')) {
    this.url = url; this.file = file; this.data = {}; this.queue = Promise.resolve();
  }
  async connect() {
    if (this.url) {
      this.client = new MongoClient(this.url, { serverSelectionTimeoutMS: 10000 });
      await this.client.connect();
      this.collection = this.client.db().collection('ruthless_state');
    } else {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      try { this.data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      console.warn('Local JSON storage is not durable on ephemeral hosts. Set DATABASE_URL for production.');
    }
    return this;
  }
  async get(key, fallback = null) {
    if (this.collection) { const doc = await this.collection.findOne({ _id: key }); return doc ? doc.value : fallback; }
    return Object.hasOwn(this.data, key) ? structuredClone(this.data[key]) : fallback;
  }
  async set(key, value) {
    if (this.collection) { await this.collection.replaceOne({ _id: key }, { _id: key, value }, { upsert: true }); return; }
    this.data[key] = structuredClone(value);
    this.queue = this.queue.then(async () => {
      const temp = `${this.file}.tmp`;
      await fs.writeFile(temp, JSON.stringify(this.data), { mode: 0o600 });
      await fs.rename(temp, this.file);
    });
    return this.queue;
  }
  async del(key) {
    if (this.collection) return this.collection.deleteOne({ _id: key });
    delete this.data[key];
    this.queue = this.queue.then(async () => { const t = `${this.file}.tmp`; await fs.writeFile(t, JSON.stringify(this.data), { mode: 0o600 }); await fs.rename(t, this.file); });
    return this.queue;
  }
  async list(prefix) {
    if (this.collection) {
      const docs = await this.collection.find({ _id: { $regex: '^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }).toArray();
      return docs.map(x => [x._id, x.value]);
    }
    return Object.entries(this.data).filter(([k]) => k.startsWith(prefix));
  }
  async close() { await this.queue; if (this.client) await this.client.close(); }
}
module.exports = Database;
