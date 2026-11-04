'use strict';const http=require('node:http'),{MongoClient}=require('mongodb'),{TenantStore,authenticate}=require('../lib/tenant-store');
const MAX_BODY=1024*1024,MAX_RESPONSE=10*1024*1024;
function json(res,status,data){const b=Buffer.from(JSON.stringify(data));if(b.length>MAX_RESPONSE){res.writeHead(413,{'content-type':'application/json'});return res.end('{"error":"Response too large"}');}res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);}
async function readBody(req){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>MAX_BODY){const e=Error('Body too large');e.status=413;throw e;}chunks.push(part);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function createServer({collection,secret}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('DATA_SERVICE_SECRET must be at least 32 bytes');
 return http.createServer(async(req,res)=>{try{
  if(req.method!=='POST'||!['/v1/get','/v1/set','/v1/delete','/v1/list'].includes(req.url))return json(res,404,{error:'Not found'});
  const authorization=req.headers.authorization||'',match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization),id=match&&authenticate(secret,match[1]);if(!id)return json(res,401,{error:'Unauthorized'});
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'JSON required'});
  const body=await readBody(req);if(!body||Array.isArray(body)||typeof body!=='object')return json(res,400,{error:'Invalid request'});
  const allowed=req.url==='/v1/set'?['key','value']:req.url==='/v1/list'?['prefix']:['key'];if(Object.keys(body).some(k=>!allowed.includes(k)))return json(res,400,{error:'Unexpected field'});
  const store=new TenantStore(collection,id);if(req.url==='/v1/get')return json(res,200,await store.getEntry(body.key));if(req.url==='/v1/set'){await store.set(body.key,body.value);return json(res,200,{ok:true});}if(req.url==='/v1/delete'){await store.del(body.key);return json(res,200,{ok:true});}return json(res,200,{entries:await store.list(body.prefix)});
 }catch(e){return json(res,e.status||400,{error:e.status===413?'Request too large':'Invalid request or storage unavailable'});}});
}
async function main(){const uri=process.env.MONGODB_URI,secret=process.env.DATA_SERVICE_SECRET;if(!uri||!secret)throw Error('Set MONGODB_URI and DATA_SERVICE_SECRET in the trusted server environment');const client=new MongoClient(uri,{serverSelectionTimeoutMS:10000});await client.connect();const db=client.db(),retention=require('../lib/pairing-retention');const maintain=()=>retention.configureRetention(db.collection('pairing_sessions'),db.collection('pairing_backups'));await maintain();const maintenance=setInterval(()=>maintain().catch(()=>console.error('Retention-index check failed.')),86400000);maintenance.unref();const server=createServer({collection:db.collection('ruthless_state'),secret});const port=Number(process.env.DATA_SERVICE_PORT||3100);server.listen(port,'127.0.0.1',()=>console.log(`Trusted data service listening locally on ${port}; use authenticated TLS proxy for remote clients.`));const stop=()=>{clearInterval(maintenance);server.close(()=>client.close().finally(()=>process.exit(0)));};process.once('SIGTERM',stop);process.once('SIGINT',stop);}
if(require.main===module)main().catch(()=>{console.error('Trusted data service could not start; check its private configuration and database connectivity.');process.exitCode=1;});
module.exports={createServer,MAX_BODY,MAX_RESPONSE};
