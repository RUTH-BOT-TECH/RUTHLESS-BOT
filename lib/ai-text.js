'use strict';
const {boundedBody}=require('./public-files');
const MODEL='mistral-Nemo-Instruct-2407', SOURCE='Mistral Nemo via LLM7', BRAND='RUTHLESS AI';
const IDENTITY=`You are ${BRAND}, the branded WhatsApp assistant running on ${SOURCE}. If asked about your model or provider, identify them accurately; command aliases do not change the model.`;
const MAX_INPUT=6000,MAX_OUTPUT=3500,TTL=30*60*1000,MAX_CONVERSATIONS=1000;
const conversations=new Map(),busy=new Set();let active=0;
const sweep=setInterval(()=>{const now=Date.now();for(const [id,e] of conversations)if(now-e.at>TTL)conversations.delete(id);},60000);sweep.unref();
function key(ctx){return `${ctx.chat}|${ctx.sender}`;}
function history(id){const entry=conversations.get(id);if(!entry||Date.now()-entry.at>TTL){conversations.delete(id);return [];}return entry.messages.slice();}
function clear(id){if(busy.has(id))return false;conversations.delete(id);return true;}
async function complete(messages){
 const response=await fetch('https://api.llm7.io/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(45000),body:JSON.stringify({model:MODEL,messages,temperature:0.4,max_tokens:950,stream:false})});
 if(!response.ok){await response.body?.cancel();throw Error('AI provider unavailable');}const j=JSON.parse((await boundedBody(response,1024*1024)).toString('utf8'));const content=j?.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw Error('No AI response');
 return content.trim().slice(0,MAX_OUTPUT);
}
async function run(ctx,text,system,{memory=false}={}){
 if(!text||text.length>MAX_INPUT)throw Error('Invalid input');const id=key(ctx);if(active>=2||busy.has(id))throw Error('AI is busy');active++;busy.add(id);
 try{const prior=memory?history(id):[];const messages=[{role:'system',content:system},...prior,{role:'user',content:text}];const answer=await complete(messages);if(memory){conversations.delete(id);conversations.set(id,{at:Date.now(),messages:[...prior,{role:'user',content:text},{role:'assistant',content:answer}].slice(-10)});if(conversations.size>MAX_CONVERSATIONS)conversations.delete(conversations.keys().next().value);}return answer;}
 finally{active--;busy.delete(id);}
}
module.exports={MODEL,SOURCE,BRAND,IDENTITY,MAX_INPUT,MAX_OUTPUT,key,history,clear,complete,run};
