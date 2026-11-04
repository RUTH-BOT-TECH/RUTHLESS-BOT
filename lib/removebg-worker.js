const {parentPort,workerData}=require('node:worker_threads');
const sharp=require('sharp');
(async()=>{
 // Bound decoded dimensions and input pixels before sending to the model.
 const jpeg=await sharp(Buffer.from(workerData),{limitInputPixels:40000000}).rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
 const blob=await require('@imgly/background-removal-node').removeBackground(new Blob([jpeg],{type:'image/jpeg'}),{model:'small',output:{format:'image/png'}});
 const bytes=Buffer.from(await blob.arrayBuffer());parentPort.postMessage({bytes});
})().catch(e=>parentPort.postMessage({error:e.message}));
