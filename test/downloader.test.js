const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicIP,resolvePublic,createSafeProxy}=require('../lib/safe-proxy');
const {validLink,domains}=require('../lib/downloader');
const {loadCommands}=require('../lib/loader');
test('site URL validation rejects confusing and internal addresses',()=>{
 for(const url of ['https://youtube.com.evil.example/watch?v=abc','http://youtube.com/watch?v=abc','https://youtube.com@127.0.0.1/','https://youtube.com:8443/'])assert.equal(validLink(url,'youtube'),false);
 assert.equal(validLink('https://www.youtube.com/watch?v=jNQXAC9IVRw','youtube'),true);
 assert.equal(validLink('https://youtu.be/jNQXAC9IVRw','youtube'),true);
 assert.equal(validLink('https://youtu.be/jNQXAC9IVRw','tiktok'),false);
 assert.ok(domains.odysee.includes('odysee.com'));
});
test('public network proxy rejects private and localhost addresses',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1'])assert.equal(publicIP(ip),false,ip);
 assert.equal(publicIP('8.8.8.8'),true);await assert.rejects(resolvePublic('localhost'));
 const proxy=await createSafeProxy();try { const net=require('node:net');const port=Number(new URL(proxy.url).port); const reply=await new Promise((resolve,reject)=>{let result='';const s=net.connect(port,'127.0.0.1',()=>s.write('CONNECT 127.0.0.1:80 HTTP/1.1\r\nHost: 127.0.0.1:80\r\n\r\n'));s.on('data',x=>result+=x);s.on('end',()=>resolve(result));s.on('error',reject);});assert.match(reply,/403 Forbidden/);} finally {proxy.close();}
});
test('video and music downloader commands load without aliases colliding',()=>{
 const c=loadCommands();for(const n of ['ytmp4','ytmp3','ytplay','yts','tiktok','instagram','vimeo','spotify','deezer','applemusic','tidal','github','gitclone'])assert.ok(c.get(n),n);
 assert.equal(c.get('play'),c.get('ytplay'));assert.equal(c.get('igdl'),c.get('instagram'));
});
