'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),root=path.join(__dirname,'..');
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'auto-downloader-test-'));await fs.mkdir(path.join(dir,'lib'));await fs.copyFile(path.join(root,'lib/python-runtime.js'),path.join(dir,'lib/python-runtime.js'));await fs.writeFile(path.join(dir,'requirements.txt'),'# synthetic\n');
 const marker=path.join(dir,'pip-calls'),leak=path.join(dir,'leak'),fake=path.join(dir,'python3');
 await fs.writeFile(fake,`#!/bin/sh
if [ -n "\${SESSION_ID:-}" ] || [ -n "\${YT_COOKIES:-}" ] || [ -n "\${DATABASE_URL:-}" ]; then echo leaked > '${leak}'; fi
if [ "$1" = "-c" ]; then
 case "$2" in
  *sys.version_info*) exit 0 ;;
  *"import yt_dlp, gallery_dl"*) [ -f "\${PYTHONPATH%%:*}/yt_dlp/__init__.py" ] && [ -f "\${PYTHONPATH%%:*}/gallery_dl/__init__.py" ]; exit $? ;;
  *"import yt_dlp"*) [ -f "\${PYTHONPATH%%:*}/yt_dlp/__init__.py" ]; exit $? ;;
 esac
fi
if [ "$1" = "-m" ] && [ "$2" = "yt_dlp" ]; then [ -f "\${PYTHONPATH%%:*}/yt_dlp/__init__.py" ] || exit 1; echo 2099.1.1; exit 0; fi
if [ "$1" = "-m" ] && [ "$2" = "gallery_dl" ]; then [ -f "\${PYTHONPATH%%:*}/gallery_dl/__init__.py" ] || exit 1; echo 2099.2; exit 0; fi
if [ "$1" = "-m" ] && [ "$2" = "pip" ] && [ "$3" = "--version" ]; then echo pip-ok; exit 0; fi
if [ "$1" = "-m" ] && [ "$2" = "pip" ] && [ "$3" = "install" ]; then
 echo call >> '${marker}'
 while [ "$#" -gt 0 ]; do if [ "$1" = "--target" ]; then shift; target=$1; break; fi; shift; done
 [ -n "\${target:-}" ] || exit 1
 mkdir -p "$target/yt_dlp" "$target/gallery_dl"
 : > "$target/yt_dlp/__init__.py"; : > "$target/gallery_dl/__init__.py"; exit 0
fi
exit 1
`,{mode:0o700});
 return {dir,marker,leak,fake};
}
async function invoke(t,source,extra={}){return run(process.execPath,['-e',source],{cwd:t.dir,timeout:30000,env:{PATH:`${t.dir}:/usr/bin:/bin`,PYTHON_BIN:path.join(t.dir,'missing-python'),SESSION_ID:'secret-do-not-forward',YT_COOKIES:'cookie-do-not-forward',DATABASE_URL:'db-do-not-forward',...extra}});}

test('automatic setup works without venv, falls back from a bad Python path, is idempotent and withholds secrets',async()=>{const t=await fixture();try{const js="const r=require('./lib/python-runtime'); Promise.all([r.setup(),r.setup()]).then(async x=>console.log(JSON.stringify({x,yt:await r.modulePython('yt_dlp'),gallery:await r.modulePython('gallery_dl')})))";const {stdout}=await invoke(t,js),result=JSON.parse(stdout.trim());assert.equal(result.x[0].ok,true);assert.equal(result.x[1].ok,true);assert.equal(result.yt.bin,'python3');assert.equal(result.gallery.bin,'python3');assert.equal((await fs.readFile(t.marker,'utf8')).trim().split('\n').length,1);await assert.rejects(fs.stat(t.leak),{code:'ENOENT'});assert.ok(await fs.stat(path.join(t.dir,'.python-deps/yt_dlp/__init__.py')));
 const again=JSON.parse((await invoke(t,"require('./lib/python-runtime').setup().then(x=>console.log(JSON.stringify(x)))")).stdout);assert.equal(again.existing,true);assert.equal((await fs.readFile(t.marker,'utf8')).trim().split('\n').length,1);
 }finally{await fs.rm(t.dir,{recursive:true,force:true});}});

test('managed update uses a separate layer and keeps the installed gallery available',async()=>{const t=await fixture();try{const js="const r=require('./lib/python-runtime'); (async()=>{await r.setup();const update=await r.updateManaged('python3');console.log(JSON.stringify({update,yt:await r.modulePython('yt_dlp')}))})()";const out=JSON.parse((await invoke(t,js)).stdout);assert.equal(out.update.ok,true);assert.equal(out.yt.version,'2099.1.1');assert.ok(await fs.stat(path.join(t.dir,'.python-deps/yt_dlp/__init__.py')));assert.ok(await fs.stat(path.join(t.dir,'.python-deps-updates/yt_dlp/__init__.py')));await assert.rejects(fs.stat(t.leak),{code:'ENOENT'});}finally{await fs.rm(t.dir,{recursive:true,force:true});}});

test('automatic setup may be explicitly disabled and npm build wiring is present',async()=>{const t=await fixture();try{const out=JSON.parse((await invoke(t,"require('./lib/python-runtime').setup().then(x=>console.log(JSON.stringify(x)))",{DOWNLOADER_AUTO_SETUP:'off'})).stdout);assert.equal(out.skipped,true);await assert.rejects(fs.stat(t.marker),{code:'ENOENT'});const pkg=require('../package.json');assert.equal(pkg.scripts.postinstall,'node scripts/setup-downloader.js');const render=await fs.readFile(path.join(root,'render.yaml'),'utf8');assert.match(render,/npm ci/);const script=await fs.readFile(path.join(root,'scripts/install-youtube.sh'),'utf8');assert.match(script,/node scripts\/setup-downloader\.js/);}finally{await fs.rm(t.dir,{recursive:true,force:true});}});

test('startup repairs missing packages automatically even if the npm installer was skipped',async()=>{const t=await fixture();try{await fs.copyFile(path.join(root,'lib/downloader-health.js'),path.join(t.dir,'lib/downloader-health.js'));await fs.symlink(path.join(root,'node_modules'),path.join(t.dir,'node_modules'),'dir');const js="require('./lib/downloader-health').ensureStartup().then(x=>console.log('RESULT '+JSON.stringify(x)))";const {stdout}=await invoke(t,js,{YT_DLP_AUTO_UPDATE:'off'});const match=stdout.match(/RESULT (\{.*\})/);assert.ok(match,stdout);const state=JSON.parse(match[1]);assert.equal(state.yt.version,'2099.1.1');assert.equal(state.yt.bin,'python3');assert.equal(state.setup.ok,true);assert.ok(await fs.stat(t.marker));await assert.rejects(fs.stat(t.leak),{code:'ENOENT'});}finally{await fs.rm(t.dir,{recursive:true,force:true});}});

test('package setup starts only after the exclusive session lease point',async()=>{const source=await fs.readFile(path.join(root,'index.js'),'utf8');assert.ok(source.indexOf('await sessionSync.start()')<source.indexOf("const youtubeDiagnostics = require('./lib/downloader-health').ensureStartup()"));});

test('missing slideshow dependencies do not expose owner setup instructions to normal users',async()=>{const gallery=require('../lib/gallery'),runtime=require('../lib/python-runtime'),health=require('../lib/downloader-health');const oldModule=runtime.modulePython,oldSetup=runtime.setup,oldStart=health.ensureStartup;let replies=[];try{runtime.modulePython=async()=>null;runtime.setup=async()=>({ok:false});health.ensureStartup=async()=>({yt:null,ffmpeg:false});await gallery.sendSlides({reply:async x=>replies.push(x)},'https://www.tiktok.com/@example/photo/1234567890123456789');assert.equal(replies.length,1);assert.match(replies[0],/unavailable/i);assert.doesNotMatch(replies[0],/install|setup|Python|pip|owner/i);}finally{runtime.modulePython=oldModule;runtime.setup=oldSetup;health.ensureStartup=oldStart;}});

test('private owner dlcheck reports local tools in one reply without installing or probing external APIs',async()=>{const command=require('../commands/owner/dlcheck'),health=require('../lib/downloader-health'),runtime=require('../lib/python-runtime');assert.equal(command.ownerOnly,true);const oldDetect=health.detect,oldGallery=runtime.modulePython,oldStart=health.ensureStartup,oldSetup=runtime.setup;let replies=[];try{health.ensureStartup=()=>{throw Error('must not update');};runtime.setup=()=>{throw Error('must not install');};health.detect=async()=>({yt:{version:'2026.10.26'},ffmpeg:true});runtime.modulePython=async name=>{assert.equal(name,'gallery_dl');return {version:'1.32.19'}};await command.run({group:true,reply:async x=>replies.push(x)});assert.equal(replies.length,1);assert.match(replies[0],/private/);replies=[];await command.run({group:false,reply:async x=>replies.push(x)});assert.equal(replies.length,1);assert.match(replies[0],/yt-dlp: available \(2026.10.26\)/);assert.match(replies[0],/gallery-dl: available/);assert.match(replies[0],/FFmpeg: available/);}finally{health.detect=oldDetect;runtime.modulePython=oldGallery;health.ensureStartup=oldStart;runtime.setup=oldSetup;}});
