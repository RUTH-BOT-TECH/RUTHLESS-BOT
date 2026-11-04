const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseGithubRepo,findGithubRepo,downloadGitHub,processAutoDL}=require('../lib/autodl');
test('GitHub URL parsing allows repository pages only and rejects unsafe URLs',()=>{
 assert.deepEqual(parseGithubRepo('https://github.com/octocat/Hello-World.git'),{owner:'octocat',repo:'Hello-World',url:'https://github.com/octocat/Hello-World'});
 for(const s of ['http://github.com/a/b','https://github.com.evil.example/a/b','https://github.com/a/b/issues','https://user@github.com/a/b','https://github.com/a','https://127.0.0.1/a/b']) assert.equal(parseGithubRepo(s),null);
 assert.equal(findGithubRepo('Look https://github.com/octocat/Hello-World!').repo,'Hello-World');
});
test('autodl ignores messages while off, nonmatching links, and its own messages',async()=>{
 const sock={sendMessage:async()=>{throw Error('unexpected send')}};
 const db={get:async()=>({autodl:false})};
 const message={key:{remoteJid:'123456789@s.whatsapp.net'},message:{conversation:'https://github.com/octocat/Hello-World'}};
 assert.equal(await processAutoDL(sock,message,db),false);
 assert.equal(await processAutoDL(sock,{...message,key:{...message.key,fromMe:true}},db),false);
});
test('download handles oversized and failed providers with bounded limits',async()=>{
 const old=global.fetch;
 try { global.fetch=async()=>({ok:true,status:200,headers:new Headers({'content-length':'52428801'})}); await assert.rejects(downloadGitHub({owner:'a',repo:'b'}),/50 MB/);
 global.fetch=async()=>({ok:false,status:404,headers:new Headers()}); await assert.rejects(downloadGitHub({owner:'a',repo:'b'}),/unavailable/);
 global.fetch=async()=>({ok:false,status:302,headers:new Headers({location:'http://127.0.0.1/secret'})}); await assert.rejects(downloadGitHub({owner:'a',repo:'b'}),/Unsafe redirect/);
 } finally { global.fetch=old; }
});
