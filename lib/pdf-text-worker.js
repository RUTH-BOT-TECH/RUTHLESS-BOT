'use strict';
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 let doc;
 try{
  const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdf.getDocument({data:new Uint8Array(workerData.data),isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true});
  doc=await task.promise;
  if(doc.numPages>20)throw Error('TOO_MANY_PAGES');
  let text='',truncated=false;
  for(let page=1;page<=doc.numPages;page++){
   const p=await doc.getPage(page);const content=await p.getTextContent();
   for(const item of content.items){if(typeof item.str!=='string')continue;const value=item.str+(item.hasEOL?'\n':' ');if(text.length+value.length>5000){text+=(value.slice(0,5000-text.length));truncated=true;break;}text+=value;}
   p.cleanup();if(truncated)break;
  }
  parentPort.postMessage({ok:true,text:text.trim(),truncated,pages:doc.numPages});
 }catch(e){parentPort.postMessage({ok:false,code:e.message==='TOO_MANY_PAGES'?'TOO_MANY_PAGES':'INVALID_PDF'});}
 finally{try{await doc?.destroy();}catch{}}
})();
