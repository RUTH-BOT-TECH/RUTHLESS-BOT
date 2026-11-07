'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {formatConnectionNotice,createConnectionNotice}=require('../lib/connection-notice');
test('connection notice uses the configured name and prefix and sends only to the owner once per socket',async()=>{
 const config={ownerNumber:'2348012222222',botName:'My Bot',prefix:'!'},sent=[];
 const sock={sendMessage:async(...args)=>{sent.push(args);}};
 assert.match(formatConnectionNotice(config),/╭─❖ My Bot/);
 assert.match(formatConnectionNotice(config),/Type !menu/);
 const notify=createConnectionNotice(sock,config);await Promise.all([notify(),notify()]);
 assert.equal(sent.length,1);assert.equal(sent[0][0],'2348012222222@s.whatsapp.net');
 assert.match(sent[0][1].text,/CONNECTED SUCCESSFULLY/);
 const reconnect=createConnectionNotice(sock,config);await reconnect();assert.equal(sent.length,2);
});
test('failure to deliver a connection notice does not reject startup or leak the error',async()=>{
 const oldWarn=console.warn,logs=[];console.warn=text=>logs.push(text);
 try{const notify=createConnectionNotice({sendMessage:async()=>{throw Error('secret-session-value');}},{ownerNumber:'123456',botName:'Test',prefix:'.'});await assert.doesNotReject(notify());assert.equal(logs.length,1);assert.doesNotMatch(logs[0],/secret-session-value/);}finally{console.warn=oldWarn;}
});
