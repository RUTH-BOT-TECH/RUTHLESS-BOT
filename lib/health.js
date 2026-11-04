'use strict';
const http=require('node:http');
function createHealth({port=3000,host='0.0.0.0',log=console.log}={}) {
 let connected=false,ready=false,started=false;
 const server=http.createServer((req,res)=>{
  if(req.url==='/ready'){res.writeHead(ready?200:503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ready}));}
  if(req.url==='/health'){res.writeHead(connected?200:503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:connected,uptime:Math.floor(process.uptime())}));}
  res.writeHead(404);res.end('Not found');
 });
 return {
  start(){if(started)return;started=true;ready=true;server.listen(port,host,()=>log(`Health server listening on ${server.address().port}`));},
  setConnected(value){connected=!!value;},
  markNotReady(){ready=false;},
  close(){ready=false;if(started){server.close();server.closeAllConnections?.();}},
  server
 };
}
module.exports={createHealth};
