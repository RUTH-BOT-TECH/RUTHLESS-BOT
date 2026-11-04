'use strict';
const crypto=require('node:crypto');
const {identity,encrypt,decrypt,phoneHash}=require('./security');
const {MAX_BACKUP,MAX_SESSION,LEASE_MS}=require('./store');
function validData(data,limit){if(!Buffer.isBuffer(data)||data.length<18||data.length>limit||data[0]!==0x1f||data[1]!==0x8b)throw Error('Invalid or oversized gzip data');}
function validLease(x){if(typeof x!=='string'||!/^[\w-]{43}$/.test(x))throw Error('Invalid lease');}
function validVersion(n){if(!Number.isSafeInteger(n)||n<1||n>=Number.MAX_SAFE_INTEGER)throw Error('Invalid version');}
function pack(x){return Object.fromEntries(['iv','tag','data'].map(k=>[k,x[k].toString('base64')]));}
function unpack(x){if(!x||typeof x!=='object')throw Error('Invalid encrypted data');return Object.fromEntries(['iv','tag','data'].map(k=>[k,Buffer.from(x[k],'base64')]));}
class PostgresStore {
 constructor(db,key){this.db=db;this.key=key;}
 async indexes(){
  for(const sql of [
   'CREATE SCHEMA IF NOT EXISTS ruthless_pairing',
   'REVOKE ALL ON SCHEMA ruthless_pairing FROM PUBLIC',
   `CREATE TABLE IF NOT EXISTS ruthless_pairing.sessions (id text PRIMARY KEY, secret_hash text NOT NULL, data jsonb NOT NULL, version bigint NOT NULL, updated_at timestamptz NOT NULL, last_used timestamptz NOT NULL, lease_token text, lease_expires_at timestamptz, previous jsonb, idle_warning boolean NOT NULL DEFAULT false)`,
   `CREATE TABLE IF NOT EXISTS ruthless_pairing.backups (id text PRIMARY KEY REFERENCES ruthless_pairing.sessions(id) ON DELETE CASCADE, data jsonb NOT NULL, version bigint NOT NULL, updated_at timestamptz NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS ruthless_pairing.support (id text PRIMARY KEY REFERENCES ruthless_pairing.sessions(id) ON DELETE CASCADE, phone_hash text NOT NULL, phone_salt text NOT NULL, paired_at timestamptz NOT NULL, last_seen timestamptz NOT NULL, bot_version text, host text, last_error jsonb NOT NULL DEFAULT '[]'::jsonb)`,
   'CREATE INDEX IF NOT EXISTS ruthless_pairing_last_used ON ruthless_pairing.sessions(last_used)'
  ])await this.db.query(sql);
 }
 async provision(secret,archive,phone){
  validData(archive,MAX_SESSION);if(!/^\d{6,15}$/.test(phone))throw Error('Invalid phone');
  const {id,secretHash}=identity(secret),salt=crypto.randomBytes(16).toString('hex'),data=pack(encrypt(this.key,id,'session',archive));
  await this.db.query(`WITH created AS (INSERT INTO ruthless_pairing.sessions (id,secret_hash,data,version,updated_at,last_used) VALUES ($1,$2,$3::jsonb,1,clock_timestamp(),clock_timestamp()) RETURNING id) INSERT INTO ruthless_pairing.support (id,phone_hash,phone_salt,paired_at,last_seen) SELECT id,$4,$5,clock_timestamp(),clock_timestamp() FROM created`,[id,secretHash,JSON.stringify(data),phoneHash(this.key,phone,salt),salt]);
 }
 async authenticate(secret){const {id,secretHash}=identity(secret);const r=await this.db.query('SELECT id,last_used,idle_warning FROM ruthless_pairing.sessions WHERE id=$1 AND secret_hash=$2',[id,secretHash]);const x=r.rows[0];return x?{id:x.id,lastUsed:x.last_used,idleWarning:x.idle_warning}:null;}
 async lease(id){const token=crypto.randomBytes(32).toString('base64url');const r=await this.db.query(`UPDATE ruthless_pairing.sessions SET lease_token=$2,lease_expires_at=clock_timestamp()+interval '90 seconds',idle_warning=idle_warning OR last_used<=clock_timestamp()-interval '60 days',last_used=clock_timestamp() WHERE id=$1 AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp()) RETURNING lease_expires_at`,[id,token]);return r.rows[0]?{lease:token,expiresAt:r.rows[0].lease_expires_at,durationMs:LEASE_MS}:null;}
 async renew(id,lease){validLease(lease);const r=await this.db.query(`UPDATE ruthless_pairing.sessions SET lease_expires_at=clock_timestamp()+interval '90 seconds',last_used=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND lease_expires_at>clock_timestamp() RETURNING lease_expires_at`,[id,lease]);return r.rows[0]?{expiresAt:r.rows[0].lease_expires_at,durationMs:LEASE_MS}:null;}
 async release(id,lease){validLease(lease);const r=await this.db.query(`UPDATE ruthless_pairing.sessions SET lease_token=NULL,lease_expires_at=NULL,last_used=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND lease_expires_at>clock_timestamp() RETURNING id`,[id,lease]);return !!r.rows[0];}
 async getSession(id,lease){validLease(lease);const r=await this.db.query(`SELECT data,version,updated_at,previous FROM ruthless_pairing.sessions WHERE id=$1 AND lease_token=$2 AND lease_expires_at>clock_timestamp()`,[id,lease]);const x=r.rows[0];if(!x)return null;const read=(data,version,updatedAt)=>{try{return {data:decrypt(this.key,id,'session',unpack(data)),version:Number(version),updatedAt};}catch{return {data:Buffer.alloc(0),version:Number(version),updatedAt};}};return {current:read(x.data,x.version,x.updated_at),previous:x.previous?read(x.previous.data,x.previous.version,x.previous.updatedAt):null};}
 async putSession(id,lease,version,data){validLease(lease);validVersion(version);validData(data,MAX_SESSION);const encrypted=pack(encrypt(this.key,id,'session',data));const r=await this.db.query(`UPDATE ruthless_pairing.sessions SET previous=jsonb_build_object('data',data,'version',version,'updatedAt',updated_at),data=$4::jsonb,version=version+1,updated_at=clock_timestamp(),last_used=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND lease_expires_at>clock_timestamp() AND version=$3 RETURNING version,updated_at`,[id,lease,version,JSON.stringify(encrypted)]);return r.rows[0]?{version:Number(r.rows[0].version),updatedAt:r.rows[0].updated_at}:null;}
 async getBackup(id){const r=await this.db.query('SELECT data,version,updated_at FROM ruthless_pairing.backups WHERE id=$1',[id]);const x=r.rows[0];return x?{data:decrypt(this.key,id,'backup',unpack(x.data)),version:Number(x.version),updatedAt:x.updated_at}:null;}
 async putBackup(id,data,expected){validData(data,MAX_BACKUP);if(!Number.isSafeInteger(expected)||expected<0)throw Error('Invalid version');const encrypted=JSON.stringify(pack(encrypt(this.key,id,'backup',data)));let r;if(expected===0)r=await this.db.query(`INSERT INTO ruthless_pairing.backups (id,data,version,updated_at) VALUES ($1,$2::jsonb,1,clock_timestamp()) ON CONFLICT (id) DO NOTHING RETURNING version,updated_at`,[id,encrypted]);else r=await this.db.query(`UPDATE ruthless_pairing.backups SET data=$2::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$3 RETURNING version,updated_at`,[id,encrypted,expected]);return r.rows[0]?{version:Number(r.rows[0].version),updatedAt:r.rows[0].updated_at}:null;}
 async heartbeat(id,body,tenant){
  const error=typeof body.lastError==='string'&&body.lastError?[{at:new Date().toISOString(),message:body.lastError.slice(0,500)}]:[];
  await this.db.query(`UPDATE ruthless_pairing.support SET last_seen=clock_timestamp(),bot_version=COALESCE($2,bot_version),host=COALESCE($3,host),last_error=(SELECT COALESCE(jsonb_agg(v ORDER BY n),'[]'::jsonb) FROM (SELECT v,n FROM jsonb_array_elements(last_error||$4::jsonb) WITH ORDINALITY AS e(v,n) ORDER BY n DESC LIMIT 20) t) WHERE id=$1`,[id,typeof body.botVersion==='string'?body.botVersion.slice(0,100):null,typeof body.host==='string'?body.host.slice(0,100):null,JSON.stringify(error)]);
  await this.db.query('UPDATE ruthless_pairing.sessions SET last_used=clock_timestamp(),idle_warning=false WHERE id=$1',[id]);
  return {unused60Days:!!tenant?.idleWarning||!!tenant?.lastUsed&&Date.now()-new Date(tenant.lastUsed)>=60*86400000};
 }
 async delete(id){await this.db.query('DELETE FROM ruthless_pairing.sessions WHERE id=$1',[id]);}
 async cleanup(){await this.db.query(`DELETE FROM ruthless_pairing.sessions WHERE last_used<clock_timestamp()-interval '90 days' AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())`);}
}
module.exports={PostgresStore};
