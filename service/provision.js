'use strict';const crypto=require('node:crypto'),{issueToken,checkId}=require('../lib/tenant-store');
// Run privately by the trusted service operator, never in a public bot chat.
try{const secret=process.env.DATA_SERVICE_SECRET;if(!secret)throw Error('Set DATA_SERVICE_SECRET in your private environment');const id=process.argv[2]?checkId(process.argv[2]):crypto.randomUUID(),token=issueToken(secret,id);console.log(`DEPLOYER_ID=${id}\nDATA_SERVICE_TOKEN=${token}\nStore both privately; never put the signing secret in a bot deployment.`);}catch(e){console.error(e.message);process.exitCode=1;}
