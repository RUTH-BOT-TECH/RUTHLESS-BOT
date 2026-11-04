const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkedUrl,allowUrl,boundedBody,safeName,headerName,LIMIT}=require('../lib/public-files');
const {loadCommands}=require('../lib/loader');
test('public file inputs restrict domains, protocols, keys and paths',()=>{
 assert.ok(checkedUrl('https://www.mediafire.com/file/zulayut7xnratjf/test.txt/file','mediafire'));
 assert.ok(checkedUrl('https://drive.google.com/file/d/0B9P1L--7Wd2vU3VUVlFnbTgtS2c/view','gdrive'));
 assert.ok(checkedUrl('https://mega.nz/file/Wt0F1bpR#WlCGMYlOS_K23Q4wH5isOK7Oin6qsa2uyEAG3C5G3ro','mega'));
 for(const [u,k] of [['https://mediafire.com.evil.org/file/id/a/file','mediafire'],['https://www.mediafire.com/folder/abc','mediafire'],['http://drive.google.com/open?id=01234567890','gdrive'],['https://drive.google.com/drive/folders/abc','gdrive'],['https://mega.nz/folder/abcdefgi#WlCGMYlOS_K23Q4wH5isOK7Oin6qsa2uyEAG3C5G3ro','mega'],['https://mega.nz/file/Wt0F1bpR','mega']])assert.equal(checkedUrl(u,k),null,u);
 assert.equal(allowUrl('https://download123.mediafire.com/file','mediafire'),true);
 for(const [u,k] of [['https://download1.mediafire.com.evil.org/a','mediafire'],['https://accounts.google.com/login','gdrive'],['http://gfs1.userstorage.mega.co.nz/a','mega'],['https://127.0.0.1/','mega'],['https://mega.nz:8443/','mega']]) assert.equal(allowUrl(u,k),false,u);
});
test('file sizes are bounded by headers and actual streamed bytes',async()=>{
 await assert.rejects(boundedBody(new Response('short',{headers:{'content-length':String(LIMIT+1)}})),/size limit/);
 await assert.rejects(boundedBody(new Response('12345'),4),/size limit/);
 assert.equal((await boundedBody(new Response('1234'),4)).toString(),'1234');
});
test('provider filenames are sanitized and commands load',()=>{
 assert.equal(safeName('../../bad\\file.txt'),'_.._bad_file.txt');
 assert.equal(headerName(`attachment; filename*=UTF-8''hello%20world.txt`),'hello world.txt');
 const c=loadCommands();for(const n of ['apk','apkdl','mediafire','gdrive','mega'])assert.ok(c.get(n),n);assert.equal(c.get('apk'),c.get('apkdl'));
});
test('file hosts reject unsafe redirects and HTML Drive responses',async()=>{
 const files=require('../lib/public-files');const old=global.fetch;
 try{
  global.fetch=async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/secret'}});
  await assert.rejects(files.download('https://drive.google.com/file/d/01234567890/view','gdrive'),/Unsafe/);
  global.fetch=async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}});
  await assert.rejects(files.download('https://drive.google.com/file/d/01234567890/view','gdrive'),/login/);
 }finally{global.fetch=old;}
});
test('autodl routes a public MediaFire link to the file sender',async()=>{
 const {processAutoDL}=require('../lib/autodl');const old=global.fetch;const sent=[];
 try{
  global.fetch=async(url)=>String(url).startsWith('https://www.mediafire.com/')?new Response('<a id="downloadButton" href="https://download123.mediafire.com/abc/test.txt">Download</a>',{headers:{'content-type':'text/html'}}):new Response('test',{headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="test.txt"'}});
  const msg={key:{remoteJid:'234998877660@s.whatsapp.net'},message:{conversation:'https://www.mediafire.com/file/abcdef/test.txt/file'}};
  const sock={user:{id:'234111111111@s.whatsapp.net'},sendMessage:async(jid,payload)=>sent.push(payload)};const db={get:async k=>k==='settings:global'?{autodl:true}:false};
  assert.equal(await processAutoDL(sock,msg,db),true);assert.equal(sent.at(-1).fileName,'test.txt');assert.equal(sent.at(-1).document.toString(),'test');
 }finally{global.fetch=old;}
});
