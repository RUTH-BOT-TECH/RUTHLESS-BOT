'use strict';
const config=require('../config'),{boundedBody}=require('./public-files'),{isNewer}=require('./heartbeat'),pkg=require('../package.json');
function repo(){try{const u=new URL(config.repoUrl),p=u.pathname.split('/').filter(Boolean);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||u.search||u.hash||p.length!==2||!p.every(x=>/^[a-zA-Z0-9_.-]{1,100}$/.test(x)))return null;const owner=p[0],name=p[1].replace(/\.git$/,'');if(!name||name==='.'||name==='..'||owner==='.'||owner==='..')return null;return {owner,name,slug:`${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,link:`https://github.com/${owner}/${name}`};}catch{return null;}}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'Ruthless-MD/1.0',accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok){await r.body?.cancel();const e=Error('GitHub unavailable');e.status=r.status;throw e;}return JSON.parse((await boundedBody(r,1024*1024)).toString('utf8'));}
const text=(s,max=500)=>String(s||'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').trim().slice(0,max);
async function getFeed(r){
 const response=await fetch(`https://github.com/${r.slug}/commits.atom`,{headers:{'user-agent':'Ruthless-MD/1.0',accept:'application/atom+xml'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok){await response.body?.cancel();throw Error('GitHub commit feed unavailable');}
 const xml=(await boundedBody(response,1024*1024)).toString('utf8');
 const $=require('cheerio').load(xml,{xmlMode:true});
 if($('feed').length!==1)throw Error('Invalid GitHub commit feed');
 const entries=[];
 $('feed > entry').each((_,entry)=>{
  const id=$(entry).children('id').first().text().trim(),match=id.match(/^tag:github\.com,2008:Grit::Commit\/([a-f0-9]{40})$/i);
  const title=text($(entry).children('title').first().text().split('\n').map(x=>x.trim()).filter(Boolean)[0],160);
  if(match&&title)entries.push({sha:match[1].toLowerCase(),message:title});
 });
 if(!entries.length)throw Error('Empty GitHub commit feed');
 return entries.slice(0,5);
}
async function notes(){
 const r=repo();if(!r)throw Error('Invalid REPO_URL');
 let noRelease=false;
 try{
  const release=await getJson(`https://api.github.com/repos/${r.slug}/releases/latest`);
  if(!release||typeof release.tag_name!=='string')throw Error('Invalid release');
  return `📰 Latest release: ${text(release.name||release.tag_name,100)}\n${text(release.body,2000)||'No release notes provided.'}\nSource: GitHub ${r.link}/releases`;
 }catch(e){noRelease=e.status===404;}
 let entries,source='GitHub API';
 try{
  const commits=await getJson(`https://api.github.com/repos/${r.slug}/commits?per_page=5`);
  if(!Array.isArray(commits))throw Error('Invalid commits');
  entries=commits.filter(c=>/^[a-f0-9]{40}$/i.test(c.sha||'')&&typeof c.commit?.message==='string').slice(0,5).map(c=>({sha:c.sha,message:text(c.commit.message.split('\n')[0],160)})).filter(c=>c.message);
  if(!entries.length)throw Error('No commits');
 }catch{entries=await getFeed(r);source='GitHub commit feed';}
 const heading=noRelease?'No GitHub release found':'Release notes unavailable';
 return `📰 ${heading}; recent default-branch commits instead:\n${entries.map(c=>`• ${c.sha.slice(0,7)} ${c.message}`).join('\n')}\nSource: ${source} ${r.link}/commits`;
}
async function rawPackage(r,sha){
 const response=await fetch(`https://raw.githubusercontent.com/${r.slug}/${sha}/package.json`,{headers:{'user-agent':'Ruthless-MD/1.0'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok){await response.body?.cancel();throw Error('GitHub package unavailable');}
 return JSON.parse((await boundedBody(response,300000)).toString('utf8'));
}
async function check(){
 const r=repo();if(!r)throw Error('Invalid REPO_URL');
 let remote,commit;
 try{
  const [file,commits]=await Promise.all([getJson(`https://api.github.com/repos/${r.slug}/contents/package.json`),getJson(`https://api.github.com/repos/${r.slug}/commits?per_page=1`)]);
  if(file.encoding!=='base64'||typeof file.content!=='string'||file.content.length>400000||!Array.isArray(commits)||!/^([a-f0-9]{40})$/i.test(commits[0]?.sha||''))throw Error('Invalid GitHub data');
  remote=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));commit=commits[0].sha.toLowerCase();
 }catch{
  const entries=await getFeed(r);commit=entries[0].sha;remote=await rawPackage(r,commit);
 }
 const version=remote.version;if(typeof version!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version))throw Error('Invalid version');
 const local=pkg.version,deployed=process.env.RENDER_GIT_COMMIT||process.env.RAILWAY_GIT_COMMIT_SHA||'',localSha=/^[a-f0-9]{40}$/i.test(deployed)?deployed.toLowerCase():null;
 let comparison=isNewer(version,local)?'A newer package version is available.':isNewer(local,version)?'The repository package version is older.':'Package versions match; this does not prove the code is identical.';
 if(localSha)comparison+=localSha===commit?' Deployed commit matches the latest default-branch commit.':' Deployed commit differs from the latest default-branch commit.';else comparison+=' Deployed commit is unknown; compare it in your hosting dashboard.';
 return {local,version,commit,localSha,comparison,repository:r.link};
}
function hook(){try{const u=new URL(config.deployHook);if(u.protocol!=='https:'||u.hostname!=='api.render.com'||u.port||u.username||u.password||u.hash||!/^\/deploy\/srv-[a-z0-9-]+$/i.test(u.pathname)||[...u.searchParams.keys()].some(x=>x!=='key')||u.searchParams.getAll('key').length!==1||!u.searchParams.get('key'))return null;return u;}catch{return null;}}
async function trigger(){const u=hook();if(!u)throw Error('Deploy hook missing or unsupported');const r=await fetch(u,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok){await r.body?.cancel();throw Error('Deploy request failed');}await r.body?.cancel();return true;}
module.exports={repo,notes,check,hook,trigger};
