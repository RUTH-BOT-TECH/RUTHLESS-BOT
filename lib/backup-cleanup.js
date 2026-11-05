'use strict';const DEFAULT_CAP=10*1024*1024,DAY=86400000;
function when(value){if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value==='string'){const n=Date.parse(value);return Number.isFinite(n)?n:null;}return null;}
function prepare(entries,{now=Date.now(),maxBytes=DEFAULT_CAP}={}){
 if(!entries||Array.isArray(entries)||typeof entries!=='object'||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid backup input');
 const out=JSON.parse(JSON.stringify(entries)),removed={antidelete:0,reminders:0,todos:0,cooldowns:0,games:0,logs:0,trimmedLogs:0};
 const time=(obj,...names)=>{if(!obj||typeof obj!=='object')return null;for(const n of names){const t=when(obj[n]);if(t!==null)return t;}return null;};
 const doneOld=(v)=>!!v&&typeof v==='object'&&(v.done===true||v.completed===true)&&((t)=>t!==null&&t<=now-30*DAY)(time(v,'completedAt','doneAt'));
 const isLog=k=>/^(?:errorlog:|log:error:)/.test(k);
 for(const [key,value] of Object.entries(out)){
  if(/^(?:cache:antidelete|antidelete:cache)(?::|$)/.test(key)){delete out[key];removed.antidelete++;continue;}
  if(/^reminder:/.test(key)&&value&&typeof value==='object'&&((t)=>t!==null&&t<=now)(time(value,'expiresAt'))){delete out[key];removed.reminders++;continue;}
  if(/^todo:/.test(key)&&!Array.isArray(value)&&doneOld(value)){delete out[key];removed.todos++;continue;}
  if(/^(?:todos|todo):/.test(key)&&Array.isArray(value)){out[key]=value.filter(x=>!doneOld(x));removed.todos+=value.length-out[key].length;continue;}
  if(/^cooldown:/.test(key)&&typeof value==='number'&&Number.isFinite(value)&&value<=now-7*DAY){delete out[key];removed.cooldowns++;continue;}
  if(/^game:(?:ttt|connect4|chess|trivia|guessnumber|mathquiz|scramble|hangman|typerace|personal):/.test(key)&&value&&typeof value==='object'&&((t)=>t!==null&&t<=now)(time(value,'expires','expiresAt'))){delete out[key];removed.games++;continue;}
  if(isLog(key)&&((t)=>t!==null&&t<=now-14*DAY)(time(value,'at','createdAt','timestamp'))){delete out[key];removed.logs++;}
 }
 for(const [key,type] of Object.entries(out))if(key.startsWith('game:active:')&&['ttt','connect4','chess','trivia','guessnumber','mathquiz','scramble','hangman','typerace'].includes(type)&&!Object.hasOwn(out,`game:${type}:${key.slice('game:active:'.length)}`)){delete out[key];removed.games++;}
 const size=()=>Buffer.byteLength(JSON.stringify({version:1,entries:out}));let bytes=size();const logs=Object.entries(out).filter(([k])=>isLog(k)).map(([key,value])=>({key,at:time(value,'at','createdAt','timestamp')})).filter(x=>x.at!==null).sort((a,b)=>a.at-b.at);
 for(const log of logs){if(bytes<=maxBytes)break;delete out[log.key];removed.trimmedLogs++;bytes=size();}
 return {entries:out,bytes,withinLimit:bytes<=maxBytes,removed};
}
module.exports={prepare,DEFAULT_CAP};
