const {test}=require('node:test'),assert=require('node:assert/strict');const ai=require('../lib/ai-text'),img=require('../lib/ai-image'),{loadCommands}=require('../lib/loader');
test('AI aliases are honest and no command name collisions occur',()=>{let c=loadCommands();for(const name of ['ai','gpt4','claude','gemini','summarize','summary','tr','song-gen','debug','imagine','dalle','clearchat'])assert.ok(c.get(name),name);assert.equal(c.get('claude'),c.get('ai'));assert.match(c.get('ai').description,/RUTHLESS AI/);assert.ok(c.get('aiinfo'));assert.match(c.get('dalle').description,/not DALL-E/);});
test('chat memory is isolated, bounded and clearable',async()=>{const old=global.fetch,requests=[];global.fetch=async(_url,opt)=>{let j=JSON.parse(opt.body);requests.push(j);return new Response(JSON.stringify({choices:[{message:{content:'reply'}}]}));};try{const c={chat:'c1',sender:'a'};ai.clear(ai.key(c));for(let i=0;i<7;i++)await ai.run(c,'hello '+i,'system',{memory:true});assert.equal(ai.history(ai.key(c)).length,10);assert.equal(requests.at(-1).messages.at(-1).content,'hello 6');await ai.run({chat:'c1',sender:'b'},'private','system',{memory:true});assert.equal(requests.at(-1).messages.length,2);await ai.run({chat:'c2',sender:'a'},'private','system',{memory:true});assert.equal(requests.at(-1).messages.length,2);assert.equal(ai.clear(ai.key(c)),true);assert.deepEqual(ai.history(ai.key(c)),[]);}finally{global.fetch=old;}});
test('AI service failures and malformed completions are rejected',async()=>{const old=global.fetch;try{global.fetch=async()=>new Response('',{status:429});await assert.rejects(ai.complete([]),/unavailable/);global.fetch=async()=>new Response('{}');await assert.rejects(ai.complete([]),/No AI response/);}finally{global.fetch=old;}});
test('AI Horde image URLs refuse private and misleading hosts',()=>{assert.equal(img.imageURL('https://abc.r2.cloudflarestorage.com/stable-horde/a.webp'),true);for(const u of ['http://abc.r2.cloudflarestorage.com/a','https://abc.r2.cloudflarestorage.com.evil.test/a','https://127.0.0.1/a','https://user@abc.r2.cloudflarestorage.com/a'])assert.equal(img.imageURL(u),false);});
test('summarize accepts quoted text and unavailable providers reply cleanly',async()=>{const {handle}=require('../handler');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),Database=require('../lib/database');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ruthless-ai-test-')),db=await new Database('',path.join(dir,'db.json')).connect(),old=global.fetch,sent=[];try{let body;global.fetch=async(_u,opts)=>{body=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:'Summary text.'}}]}));};const sock={user:{id:'234111111111@s.whatsapp.net'},sendMessage:async(_jid,p)=>sent.push(p)};const msg={key:{remoteJid:'234811111111@s.whatsapp.net'},message:{extendedTextMessage:{text:'.summarize',contextInfo:{quotedMessage:{conversation:'A long passage for summary.'}}}}};await handle(sock,msg,loadCommands(),db);assert.equal(body.messages.at(-1).content,'A long passage for summary.');assert.match(sent.at(-1).text,/Summary text/);global.fetch=async()=>new Response('',{status:429});await handle(sock,{key:{remoteJid:'234822222222@s.whatsapp.net'},message:{conversation:'.explain hello'}},loadCommands(),db);assert.match(sent.at(-1).text,/unavailable or rate-limited/);}finally{global.fetch=old;await db.close();await fs.rm(dir,{recursive:true,force:true});}});

test('RUTHLESS AI brands replies while aiinfo honestly identifies its provider',async()=>{
 const commands=loadCommands(),old=global.fetch,replies=[];let request;
 try{
  global.fetch=async(_url,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:'Hello!'}}]}));};
  const ctx={chat:'branding-chat',sender:'branding-sender',args:['Hello'],reply:async text=>replies.push(text)};
  ai.clear(ai.key(ctx));await commands.get('ai').run(ctx);
  assert.equal(replies.length,1);assert.match(replies.at(-1),/RUTHLESS AI/);assert.doesNotMatch(replies.at(-1),/Mistral|Thinking/);
  assert.match(request.messages[0].content,/RUTHLESS AI/);assert.match(request.messages[0].content,/Mistral Nemo via LLM7/);
  replies.length=0;await commands.get('aiinfo').run(ctx);assert.match(replies[0],/Mistral Nemo via LLM7/);assert.match(replies[0],/sent to LLM7/);
 }finally{global.fetch=old;}
});

test('ordinary identity replies use only the bot brand; asking for model details remains honest',async()=>{
 const commands=loadCommands(),sent=[],old=global.fetch;let called=0;
 try{
  global.fetch=async(_url,opts)=>{called++;const body=JSON.parse(opts.body);assert.match(body.messages[0].content,/If explicitly asked/);return new Response(JSON.stringify({choices:[{message:{content:'Mistral Nemo via LLM7'}}]}));};
  const ctx={chat:'identity',sender:'one',args:['who','are','you?'],reply:async text=>sent.push(text)};
  await commands.get('ai').run(ctx);assert.equal(called,0);assert.equal(sent.length,1);assert.match(sent[0],/RUTHLESS AI/);assert.doesNotMatch(sent[0],/Mistral|LLM7|Thinking/);
  sent.length=0;ctx.args=['what','model','powers','you?'];await commands.get('ai').run(ctx);assert.equal(called,1);assert.equal(sent.length,1);assert.match(sent[0],/Mistral Nemo via LLM7/);
 }finally{global.fetch=old;}
});
test('.ask pdf routes to the PDF command instead of an unrelated chat answer',async()=>{
 const commands=loadCommands(),sent=[];const ctx={commands,invoked:'ask',args:['pdf'],chat:'123456789@s.whatsapp.net',sender:'123456789@s.whatsapp.net',msg:{key:{remoteJid:'123456789@s.whatsapp.net'},message:{conversation:'.ask pdf'}},reply:async text=>sent.push(text)};
 await commands.get('ask').run(ctx);assert.equal(sent.length,1);assert.match(sent[0],/askpdf/);assert.match(sent[0],/LLM7/);
});
