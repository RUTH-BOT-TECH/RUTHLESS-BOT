'use strict';
// Codes only: never record message text, credentials, shell output or arbitrary error strings.
const events=[],MAX=100;
function record(code,level='info'){if(!/^[A-Z][A-Z0-9_]{0,60}$/.test(code)||!['info','error'].includes(level))return;events.push({at:new Date().toISOString(),level,code});if(events.length>MAX)events.shift();}
function list(errorsOnly=false){return events.filter(e=>!errorsOnly||e.level==='error').map(e=>({...e}));}
function clear(){const count=events.length;events.length=0;return count;}
module.exports={record,list,clear};
