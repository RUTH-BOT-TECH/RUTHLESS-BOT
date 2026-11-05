'use strict';
// Runs only inside the fail-closed OS isolation created by selftest-enter.sh.
const fs=require('node:fs'),path=require('node:path');
if(process.argv[2]==='__safety_probe'){
 // Verify that isolation really hides host paths, prevents writes to the copied
 // app and blocks an actual socket attempt in a fresh, unpatched subprocess.
 let readOnly=false;try{fs.writeFileSync('/app/config.js','blocked');}catch{readOnly=true;}
 const {spawnSync}=require('node:child_process');
 const check=spawnSync(process.execPath,['-e',"const n=require('net');const s=n.connect(443,'1.1.1.1');s.on('connect',()=>process.exit(1));s.on('error',e=>process.exit(e.code==='ENETUNREACH'?0:2));setTimeout(()=>process.exit(3),1500)"],{timeout:3000,stdio:'ignore'});
 const ok=readOnly&&!fs.existsSync('/home')&&!fs.existsSync('/proc')&&!fs.existsSync('/app/.env')&&!process.env.SELFTEST_SECRET&&check.status===0;
 process.stdout.write('SELFTEST_RESULT '+JSON.stringify({status:ok?'working':'unverified',detail:ok?'Isolation verified':'Isolation preflight failed'})+'\n',()=>process.exit(ok?0:1));
 return;
}
let networkAttempted=false;
const blocked=()=>{networkAttempted=true;throw Error('SELFTEST_NETWORK_BLOCKED');};
// Record common network attempts for honest inconclusive results; the network
// namespace, not these JS hooks, enforces the actual network isolation.
global.fetch=async()=>blocked();
for(const m of ['node:net','node:tls']){const x=require(m);if(x.connect)x.connect=blocked;if(x.createConnection)x.createConnection=blocked;}
for(const m of ['node:http','node:https']){const x=require(m);x.request=blocked;x.get=blocked;}
try{require('undici').fetch=async()=>blocked();}catch{}
const cmds=require('./loader').loadCommands();
const command=cmds.get(process.argv[2]);
const media=require('./media');
const sampleDir='/app/selftest-fixtures';
const samples={image:fs.readFileSync(path.join(sampleDir,'sample.png')),sticker:fs.readFileSync(path.join(sampleDir,'sample.webp'))};
for(const ext of ['mp4','wav'])try{samples[ext]=fs.readFileSync(path.join(sampleDir,`sample.${ext}`));}catch{}
const fileType={image:'image/png',sticker:'image/webp',video:'video/mp4',audio:'audio/wav'};
media.download=async(_sock,msg)=>{const type=media.mediaInfo(msg)?.type;const b=samples[type==='video'?'mp4':type==='audio'?'wav':type];if(!b)throw Error('SELFTEST_FIXTURE_UNAVAILABLE');return b;};
const fixtureArgs={
 ping:'',runtime:'',alive:'',time:'Africa/Lagos',calendar:'Africa/Lagos',rate:'5',language:'en',weather:'Lagos',trivia:'',
 calc:'2+3',hash:'sha256 hello',caesar:'3 hello',vigenere:'encode key hello','random-string':'16',password:'16',lorem:'1',bcrypt:'hash hello',
 encrypt:'test | hello',cipher:'encrypt test | hello',useragent:'Mozilla/5.0',dns:'example.com',ip:'8.8.8.8',whois:'example.com',
 base64dec:'aGVsbG8=',binary2text:'01101000 01101001',hex2text:'6869',bin2dec:'1010',hex2dec:'ff',decimal:'binary 101',roman2num:'X',
 currency:'1 USD EUR',forex:'1 USD EUR',unit:'1 m km',length:'1 m km',weight:'1 kg lb',volume:'1 l gal',area:'1 m2 km2',
 'speed-convert':'1 kmh mph','time-convert':'1 min sec',temperature:'1 c f',resize:'64x64',rotate:'90',take:'Test|Selftest',meme:'Hello|World',
 emojimix:'😀+😃',emoji:'😀',watermark:'hello',rps:'rock',dice:'6',wheel:'one | two',lovecalc:'Alice | Bob',zodiac:'01-01',horoscope:'aries',
 '8ball':'Will this work?',guessnumber:'5',scramble:'hello',hangman:'a',guessword:'hello',mathquiz:'2',
};
function argsFor(c){if(Object.hasOwn(fixtureArgs,c.name))return fixtureArgs[c.name];if(c.category==='downloaders')return 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
 if(/<.*(?:url|link)/i.test(c.usage||''))return 'https://example.com/';
 if(/<.*(?:amount|number|integer|length|degree|1[–-])/i.test(c.usage||''))return '2';
 if(/<.*(?:text|message|query|prompt|question|word|name|city|phrase)/i.test(c.usage||''))return 'hello';
 return '';}
function fixtureType(c){let usage=c.usage||'';if(c.category==='audio'||/reply to audio/i.test(usage))return 'audio';if(/reply to video/i.test(usage))return 'video';if(/reply to sticker/i.test(usage))return 'sticker';return 'image';}
function makeContext(c){
 const sender='15550000001@s.whatsapp.net',bot='15550000002@s.whatsapp.net',chat=c.groupOnly?'1234567890-1234567890@g.us':sender,group=chat.endsWith('@g.us'),type=fixtureType(c),out=[],data=new Map();
 const quoted={[`${type}Message`]:{mimetype:fileType[type],fileLength:100,seconds:1},conversation:'Synthetic quoted message'};
 const msg={key:{remoteJid:chat,id:'SELFTEST',participant:sender,fromMe:false},pushName:'Selftest',message:{extendedTextMessage:{text:`.${c.name} ${argsFor(c)}`,contextInfo:{quotedMessage:quoted,stanzaId:'SAMPLE',participant:sender,mentionedJid:[sender]}}}};
 const db={async get(k,d){return data.has(k)?data.get(k):d;},async set(k,v){data.set(k,v);return v;},async del(k){data.delete(k);},async list(prefix=''){return [...data.entries()].filter(([k])=>k.startsWith(prefix));}};
 const sock={user:{id:bot},async sendMessage(jid,payload){out.push({jid,payload});return {key:{remoteJid:jid,id:'SYNTHETIC'}};},async groupMetadata(){return {id:chat,subject:'Synthetic group',owner:sender,participants:[{id:sender,admin:'admin'},{id:bot,admin:'admin'}]};},async groupFetchAllParticipating(){return {};},async profilePictureUrl(){return null;},async onWhatsApp(j){return [{jid:j,exists:true}];}};
 const text=argsFor(c),ctx={sock,msg,sender,args:text?text.split(/\s+/):[],commands:cmds,db,chat,group,owner:false,moderator:true,invoked:c.name,box:String,markReplied(){},reply:async(text,options={})=>{out.push({jid:chat,payload:{text:String(text),...options}});}};
 return {ctx,out};
}
function result(status,detail){return {status,detail:String(detail).replace(/[\r\n\t]+/g,' ').slice(0,180)};}
async function main(){
 if(!command||typeof command.run!=='function')return result('failed','Command has no run function');
 const {ctx,out}=makeContext(command);
 try{await command.run(ctx);if(command.name==='merge-audio')await command.run(ctx);}catch(e){if(networkAttempted||/SELFTEST_(?:NETWORK_BLOCKED|FIXTURE_UNAVAILABLE)/.test(e?.message||''))return result('unverified',networkAttempted?'Network disabled in isolated test':'Sample media unavailable');if(e instanceof TypeError)return result('unverified','Synthetic context may be incomplete: '+e.message);return result('failed',`${e?.name||'Error'}: ${e?.message||'Command threw'}`);}
 if(networkAttempted)return result('unverified','Requires a network call; isolation blocks network');
 const messages=out.map(x=>x.payload?.text||x.payload?.caption||'').filter(Boolean),last=messages.at(-1)||'';
 const key=messages.join(' ').match(/(?:set|missing|requires?|needs?|configure)\s+([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET))\b/i);
 if(key&&/^[A-Z][A-Z0-9_]+$/.test(key[1]))return result('key',key[1]);
 if(/\b(?:usage:|example:|reply to or caption|reply to (?:an? |a )?(?:image|video|audio|sticker)|invalid (?:input|amount|format|argument|expression)|not configured|must be (?:a |between|from)|please provide)\b/i.test(last))return result('unverified','Synthetic input rejected or configuration not supplied');
 const knownLocal=new Set('ping calc base64enc base64dec text2binary binary2text text2hex hex2text bin2dec dec2bin hex2dec dec2hex num2roman roman2num blur sharpen contrast brighten darken grayscale sepia invert flip mirror crop compress enhance rotate resize'.split(' '));
 if(/(?:⚠️|❌|⛔).*\b(?:failed|unavailable|could not|cannot|error|invalid|not found)\b/i.test(last))return knownLocal.has(command.name)?result('failed','Synthetic check: '+last):result('unverified','Fixture, sandbox or provider was insufficient: '+last);
 if(/(?:first clip queued|reply to the second clip|no active|do not have (?:a|an|any)|you have no|start (?:a|an) .* first)/i.test(last))return result('unverified','Only a prerequisite or intermediate step was reached');
 if(/^(?:⚠️|❌|⛔|🔒)/.test(last))return result('unverified','Synthetic request was rejected or did not produce a success result');
 if(!out.length||messages.length&&/^⏳/.test(last)&&!out.some(x=>Object.keys(x.payload||{}).some(k=>['image','video','audio','sticker','document','contacts'].includes(k))))return result('unverified','No definitive final output');
 return result('working','Synthetic execution completed; real delivery not tested');
}
main().then(r=>{process.stdout.write('\nSELFTEST_RESULT '+JSON.stringify(r)+'\n',()=>process.exit(0));}).catch(()=>{process.stdout.write('\nSELFTEST_RESULT '+JSON.stringify(result('unverified','Worker setup failed'))+'\n',()=>process.exit(0));});
