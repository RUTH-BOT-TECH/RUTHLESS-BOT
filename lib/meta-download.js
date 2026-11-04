'use strict';
const {load}=require('cheerio');const sharp=require('sharp');const {ProxyAgent,fetch}=require('undici');const {createSafeProxy}=require('./safe-proxy');const {boundedBody}=require('./public-files');
const LIMIT=50*1024*1024, MAX_ITEMS=20;let active=0;
function instagramId(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.port||u.username||u.password)return null;return u.pathname.match(/^\/p\/([A-Za-z0-9_-]{5,30})\/?$/)?.[1]||null;}catch{return null;}}
function threadsId(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)||u.port||u.username||u.password)return null;const m=u.pathname.match(/^\/@[A-Za-z0-9._]{1,64}\/post\/([A-Za-z0-9_-]{5,30})(?:\/[A-Za-z0-9_-]+)?\/?$/)||u.pathname.match(/^\/t\/([A-Za-z0-9_-]{5,30})\/?$/);return m?.[1]||null;}catch{return null;}}
function mediaHost(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname);}catch{return false;}}
function best(arr){return (Array.isArray(arr)?arr:[]).filter(x=>typeof x?.url==='string'&&mediaHost(x.url)).sort((a,b)=>(Number(b.width)||0)*(Number(b.height)||0)-(Number(a.width)||0)*(Number(a.height)||0))[0]?.url;}
function parseThreads(html,id){const $=load(html), matches=[];$('script[type="application/json"]').each((_,e)=>{let o;try{o=JSON.parse($(e).html()||'');}catch{return;}const stack=[o];while(stack.length){const v=stack.pop();if(!v||typeof v!=='object')continue;if(v.code===id&&[1,2,8].includes(v.media_type))matches.push(v);for(const x of Object.values(v))if(x&&typeof x==='object')stack.push(x);}});
 if(!matches.length)throw Error('Post media not found');
 for(const p of matches){try{let nodes=p.media_type===8?p.carousel_media:[p];if(!Array.isArray(nodes)||!nodes.length||nodes.length>MAX_ITEMS)throw Error(nodes?.length>MAX_ITEMS?'Too many items':'Missing media');if(Number.isInteger(p.carousel_media_count)&&p.carousel_media_count!==nodes.length)throw Error('Incomplete carousel');const items=nodes.map(n=>{let kind=n.media_type===1?'image':n.media_type===2?'video':null;let url=kind==='image'?best(n.image_versions2?.candidates):kind==='video'?best(n.video_versions):null;if(!kind||!url)throw Error('Incomplete media');return{kind,url};});return items;}catch(e){if(e.message==='Too many items')throw e;}}
 throw Error('Post media not found');}
function parseInstagram(html,id){const $=load(html),container=$('[data-media-type][data-permalink]').first();if(!container.length||instagramId(container.attr('data-permalink'))!==id)throw Error('Post mismatch');const type=container.attr('data-media-type');
 if(type==='GraphImage'){const url=container.find('a.EmbeddedMedia img.EmbeddedMediaImage').first().attr('src');if(!url||!mediaHost(url))throw Error('Image unavailable');return [{kind:'image',url}];}
 if(type!=='GraphSidecar')throw Error('Not a photo post');const m=html.match(/"contextJSON":("(?:\\.|[^"\\])*")/);if(!m)throw Error('Album unavailable');let obj;try{obj=JSON.parse(JSON.parse(m[1]));}catch{throw Error('Album unavailable');}const media=obj?.gql_data?.shortcode_media;if(obj?.context?.shortcode!==id||media?.shortcode!==id||media.__typename!=='GraphSidecar')throw Error('Post mismatch');const edges=media.edge_sidecar_to_children?.edges;if(!Array.isArray(edges)||!edges.length||edges.length>MAX_ITEMS)throw Error(edges?.length>MAX_ITEMS?'Too many items':'Album unavailable');
 return edges.map(({node})=>{if(node?.is_video!==false||!mediaHost(node.display_url))throw Error('Album contains unsupported media');return{kind:'image',url:node.display_url};});}
async function req(url,type,dispatcher,signal,id){for(let i=0;i<4;i++){
  const u=new URL(url);if(u.protocol!=='https:'||u.port||u.username||u.password)throw Error('Unsafe host');
  if(type==='instagram'&&!(u.hostname==='www.instagram.com'&&u.pathname===`/p/${id}/embed/captioned/`))throw Error('Unsafe Instagram redirect');
  if(type==='threads'&&threadsId(url)!==id)throw Error('Unsafe Threads redirect');
  if(type==='media'&&!mediaHost(url))throw Error('Unsafe media host');
  const r=await fetch(url,{dispatcher,redirect:'manual',signal,headers:{'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}});
  if(r.status>=300&&r.status<400){const loc=r.headers.get('location');await r.body?.cancel();if(!loc)throw Error('Missing redirect');url=new URL(loc,url).href;continue;}
  if(!r.ok){await r.body?.cancel();throw Error('Provider unavailable');}return r;
 }throw Error('Too many redirects');}
function storyUsername(input){const x=String(input||'').replace(/^@/,'').toLowerCase();return /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/.test(x)?x:null;}
function storyLink(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.port||u.username||u.password)return null;const m=u.pathname.match(/^\/stories\/([a-z0-9._]{1,30})\/?$/i);return m?storyUsername(m[1]):null;}catch{return null;}}
function parseStories(json){
 if(json?.ok!==true||json.type!=='stories'||json.demo!==false||!Array.isArray(json.data))throw Error('Story provider unavailable');
 const now=Math.floor(Date.now()/1000), items=[];
 for(const v of json.data){if(!Number.isFinite(v.expiresAt)||!Number.isFinite(v.takenAt))throw Error('Incomplete story metadata');if(v.expiresAt<=now)continue;
  if(!['image','video'].includes(v.type))throw Error('Unsupported story type');const url=v.type==='image'?v.imageUrl:v.videoUrl;if(!mediaHost(url))throw Error('Unsupported story media');items.push({kind:v.type,url});}
 if(items.length>MAX_ITEMS)throw Error('Too many items');return items;
}
async function fetchItems(items,dispatcher,signal,id){const results=[];let total=0;
 for(const item of items){const response=await req(item.url,'media',dispatcher,signal,id);let data=await boundedBody(response,LIMIT-total);if(item.kind==='image'){let image=sharp(data,{limitInputPixels:40000000}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format))throw Error('Not an image');data=await image.rotate().jpeg({quality:85}).toBuffer();}else if(data.length<12||data.toString('ascii',4,8)!=='ftyp')throw Error('Not an MP4');total+=data.length;if(total>LIMIT)throw Error('File exceeds size limit');results.push({kind:item.kind,data});}return results;
}
async function download(raw,type){const id=type==='instagram'?instagramId(raw):type==='threads'?threadsId(raw):type==='stories'?storyUsername(raw):null;if(!id)throw Error('Invalid URL');if(active>=2)throw Error('Downloader busy');active++;let proxy,dispatcher;try{
 proxy=await createSafeProxy();dispatcher=new ProxyAgent(proxy.url);const signal=AbortSignal.timeout(90000);let items;
 if(type==='stories'){
  const r=await fetch('https://storylurk.com/api/instagram/',{method:'POST',dispatcher,redirect:'error',signal,headers:{'content-type':'application/json','origin':'https://storylurk.com','referer':'https://storylurk.com/','user-agent':'Mozilla/5.0'},body:JSON.stringify({type:'stories',username:id})});if(!r.ok){await r.body?.cancel();throw Error('Story provider unavailable');}items=parseStories(JSON.parse((await boundedBody(r,2*1024*1024)).toString('utf8')));
 }else{
  const pageURL=type==='instagram'?`https://www.instagram.com/p/${id}/embed/captioned/`:`https://www.threads.com/t/${id}/`;
  const res=await req(pageURL,type,dispatcher,signal,id);const html=(await boundedBody(res,3*1024*1024)).toString('utf8');items=type==='instagram'?parseInstagram(html,id):parseThreads(html,id);
 }
 return await fetchItems(items,dispatcher,signal,id);
 }finally{active--;if(dispatcher)await dispatcher.close().catch(()=>{});proxy?.close();}}
async function send(ctx,url,type,{onNotPhoto}={}){let items;try{items=await download(url,type);}catch(e){if(type==='instagram'&&e.message==='Not a photo post'&&onNotPhoto)return onNotPhoto();let message=e.message.includes('Too many items')?`⚠️ This post contains more than ${MAX_ITEMS} media items.`:e.message.includes('size limit')?'⚠️ The media exceeds the 50 MB limit.':e.message.includes('busy')?'⏳ Social downloader is busy. Try again shortly.':`⚠️ Could not download this public ${type==='instagram'?'Instagram photo post':type==='stories'?'Instagram stories from StoryLurk':'Threads post'}. It may be private, blocked, unavailable or unsupported.`;return ctx.reply(message);}
 if(!items.length)return ctx.reply('⚠️ No current public stories are available from StoryLurk for this username.');
 try{for(let i=0;i<items.length;i++){if(i)await new Promise(r=>setTimeout(r,1000));let item=items[i],caption=ctx.box(`✅ ${type==='instagram'?'Instagram':type==='stories'?'Instagram story':'Threads'} media ${i+1}/${items.length}\nSource: public ${type==='instagram'?'Instagram embed':type==='stories'?'StoryLurk (third-party)':'Threads post'}`);await ctx.sock.sendMessage(ctx.chat,{[item.kind]:item.data,mimetype:item.kind==='image'?'image/jpeg':'video/mp4',caption},{quoted:ctx.msg});ctx.markReplied?.();}}catch{await ctx.reply('⚠️ Could not send all media items. Please try again.');}}
module.exports={instagramId,threadsId,mediaHost,parseInstagram,parseThreads,storyUsername,storyLink,parseStories,download,send,MAX_ITEMS,LIMIT};
