// Forward outbound downloader traffic only to public IPs, blocking private-network SSRF.
const http=require('node:http');
const net=require('node:net');
const dns=require('node:dns/promises');
const ipaddr=require('ipaddr.js');
function publicIP(address) {
 try { return ipaddr.process(address).range()==='unicast'; } catch { return false; }
}
async function resolvePublic(host) {
 if(!host || host.length>253 || host==='localhost' || host.toLowerCase().endsWith('.localhost'))throw Error('Blocked host');
 const records=net.isIP(host) ? [{address:host}] : await dns.lookup(host,{all:true,verbatim:true});
 if(!records.length || records.some(r=>!publicIP(r.address)))throw Error('Blocked address');
 return records[0].address;
}
function permittedPort(port) {return port===80 || port===443;}
async function createSafeProxy() {
 const sockets=new Set();
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url);if(url.protocol!=='http:' || url.username || url.password || !permittedPort(Number(url.port||80))) throw Error('Bad URL');
   const address=await resolvePublic(url.hostname), port=Number(url.port||80);
   const headers={...req.headers,host:url.host};delete headers['proxy-connection'];
   const upstream=http.request({host:address,port,path:url.pathname+url.search,method:req.method,headers,timeout:30000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();}); req.pipe(upstream);
  }catch{if(!res.headersSent)res.writeHead(403);res.end();}
 });
 server.on('connect',async(req,client,head)=>{
  try {
   const u=new URL(`http://${req.url}`);const port=Number(u.port||443);if(!permittedPort(port) || u.username || u.password)throw Error('Bad target');
   const address=await resolvePublic(u.hostname);if(client.destroyed)return;
   const remote=net.connect(port,address,()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);remote.pipe(client);client.pipe(remote);});
   remote.setTimeout(30000,()=>remote.destroy());remote.on('error',()=>client.destroy());client.on('error',()=>remote.destroy());client.on('close',()=>remote.destroy());remote.on('close',()=>client.destroy());
  }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
 });
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${server.address().port}`,close:()=>{for(const s of sockets)s.destroy();server.close();}};
}
module.exports={createSafeProxy,publicIP,resolvePublic};
