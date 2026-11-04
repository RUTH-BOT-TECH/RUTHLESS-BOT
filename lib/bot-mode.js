'use strict';
const config=require('../config');
async function current(db){const value=await db.get('settings:mode',null);return value==='self'||value==='public'?value:config.mode==='self'?'self':'public';}
module.exports={current};
