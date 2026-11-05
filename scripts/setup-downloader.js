'use strict';
// npm install/ci invokes this automatically; startup retries if needed.
if(process.env.DOWNLOADER_AUTO_SETUP==='off')process.exit(0);
const runtime=require('../lib/python-runtime');
runtime.setup().then(r=>{if(r.ok)console.log(`[YouTube] Python downloader dependencies ${r.existing?'already available':'installed locally'}.`);else console.warn(`[YouTube] Automatic downloader setup incomplete: ${r.reason} The bot will still start and retry on startup.`);}).catch(()=>console.warn('[YouTube] Automatic downloader setup could not complete. The bot will retry on startup.'));
