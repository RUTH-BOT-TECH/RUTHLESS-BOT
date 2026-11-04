'use strict';
// MongoDB's TTL monitor handles deletion; application never enumerates tenant ids or backup payloads.
const {checkId}=require('./tenant-store');const MAX_IDLE_SECONDS=90*86400;
async function configureRetention(sessions,backups){await sessions.createIndex({lastUsed:1},{expireAfterSeconds:MAX_IDLE_SECONDS,name:'session_idle_90_days'});await backups.createIndex({lastUsed:1},{expireAfterSeconds:MAX_IDLE_SECONDS,name:'backup_idle_90_days'});}
async function appendError(collection,id,error){if(typeof error!=='string')throw Error('Invalid error');id=checkId(id);await collection.updateOne({_id:id},{$push:{lastError:{$each:[{at:new Date(),message:error.slice(0,500)}],$slice:-20}}},{upsert:true});}
module.exports={configureRetention,appendError,MAX_IDLE_SECONDS};
