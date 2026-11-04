'use strict';const running=new Map();
async function withLock(key,fn){const prev=running.get(key)||Promise.resolve();const current=prev.catch(()=>{}).then(fn);running.set(key,current);try{return await current;}finally{if(running.get(key)===current)running.delete(key);}}
module.exports={withLock};
