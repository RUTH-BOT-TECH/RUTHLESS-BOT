'use strict';
const config=require('../../config'),core=require('./index'),{boundedBody}=require('../../lib/public-files');
const base={category:'converters',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:2};
const define=(name,description,usage,run)=>({...base,name,aliases:[],description,usage,run});
const specs={
 length:{mm:.001,cm:.01,m:1,km:1000,in:.0254,ft:.3048,yd:.9144,mi:1609.344},
 weight:{mg:.000001,g:.001,kg:1,oz:.028349523125,lb:.45359237},
 volume:{ml:.001,l:1,gal:3.785411784},
 'speed-convert':{'m/s':1,'km/h':1/3.6,mph:.44704,knot:.514444444444},
 area:{'mm2':.000001,'cm2':.0001,'m2':1,'km2':1000000,'in2':.00064516,'ft2':.09290304,'yd2':.83612736,acre:4046.8564224,hectare:10000},
 'time-convert':{ms:.001,s:1,min:60,h:3600,day:86400,week:604800},
 temperature:{c:1,f:1,k:1}
};
const aliases={millimeter:'mm',millimeters:'mm',centimeter:'cm',centimeters:'cm',meter:'m',meters:'m',metre:'m',metres:'m',kilometer:'km',kilometers:'km',kilometre:'km',kilometres:'km',inch:'in',inches:'in',foot:'ft',feet:'ft',yard:'yd',yards:'yd',mile:'mi',miles:'mi',milligram:'mg',milligrams:'mg',gram:'g',grams:'g',kilogram:'kg',kilograms:'kg',ounce:'oz',ounces:'oz',pound:'lb',pounds:'lb',lbs:'lb',milliliter:'ml',milliliters:'ml',millilitre:'ml',millilitres:'ml',liter:'l',liters:'l',litre:'l',litres:'l',gallon:'gal',gallons:'gal',celsius:'c',fahrenheit:'f',kelvin:'k','kph':'km/h','kmh':'km/h','mps':'m/s','knots':'knot','sec':'s','second':'s','seconds':'s','minute':'min','minutes':'min','hour':'h','hours':'h','days':'day','weeks':'week','ha':'hectare','hectares':'hectare','acres':'acre'};
const norm=x=>aliases[String(x||'').toLowerCase()]||String(x||'').toLowerCase();
function amount(x){if(typeof x!=='string'||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d{1,3})?$/i.test(x))return null;const n=Number(x);return Number.isFinite(n)&&Math.abs(n)<=1e15?n:null;}
function calculate(kind,n,from,to){from=norm(from);to=norm(to);const units=specs[kind];if(!units||!Object.hasOwn(units,from)||!Object.hasOwn(units,to)||!Number.isFinite(n))return null;let value;if(kind==='temperature'){const c=from==='c'?n:from==='f'?(n-32)*5/9:n-273.15;if(c < -273.15-1e-9)return null;value=to==='c'?c:to==='f'?c*9/5+32:c+273.15;}else value=n*units[from]/units[to];return Number.isFinite(value)?Number(value.toPrecision(12)):null;}
function result(ctx,kind,n,from,to){const converted=calculate(kind,n,from,to);if(converted===null)return ctx.reply(`⚠️ Invalid ${kind} conversion or incompatible units. Use ${config.prefix}${kind} <amount> <from> <to>.${kind==='temperature'?' Temperature must be at or above absolute zero.':''}`);return ctx.reply(`🔄 ${n} ${norm(from)} = ${converted} ${norm(to)}${kind==='volume'?'\nGallons are US liquid gallons.':''}`);}
const generic=Object.keys(specs).map(kind=>define(kind,`Convert ${kind} units locally.`,`${kind} <amount> <from> <to>`,ctx=>{const [raw,from,to]=ctx.args,n=amount(raw);if(ctx.args.length!==3||n===null||!from||!to)return ctx.reply(`⚠️ Usage: ${config.prefix}${kind} <amount> <from> <to>. Units: ${Object.keys(specs[kind]).join(', ')}`);return result(ctx,kind,n,from,to);}));
const direct={km2miles:['length','km','mi'],miles2km:['length','mi','km'],kg2lbs:['weight','kg','lb'],lbs2kg:['weight','lb','kg'],cm2inch:['length','cm','in'],inch2cm:['length','in','cm']};
const shortcuts=Object.entries(direct).map(([name,[kind,from,to]])=>define(name,`Convert ${from} to ${to} locally.`,`${name} <amount>`,ctx=>{const n=amount(ctx.args[0]);if(ctx.args.length!==1||n===null)return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <amount>`);return result(ctx,kind,n,from,to);}));
const target={celsius:['temperature','c'],fahrenheit:['temperature','f'],kelvin:['temperature','k'],liters:['volume','l'],gallons:['volume','gal']};
const targets=Object.entries(target).map(([name,[kind,to]])=>define(name,`Convert a supplied unit to ${to}.`,`${name} <amount> <from-unit>`,ctx=>{const n=amount(ctx.args[0]);if(ctx.args.length!==2||n===null)return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <amount> <from-unit>`);return result(ctx,kind,n,ctx.args[1],to);}));
const currency=core.find(c=>c.name==='currency'),crypto=core.find(c=>c.name==='crypto');
const fx={usd2inr:['USD','INR'],usd2eur:['USD','EUR'],eur2usd:['EUR','USD']};
const foreign=Object.entries(fx).map(([name,[from,to]])=>define(name,`Convert ${from} to ${to} via ExchangeRate-API.`,`${name} <amount>`,ctx=>{if(ctx.args.length!==1||amount(ctx.args[0])===null)return ctx.reply(`⚠️ Usage: ${config.prefix}${name} <amount>`);return currency.run({...ctx,args:[ctx.args[0],from,to]});}));
foreign.push(define('forex','Convert foreign currencies via ExchangeRate-API.','forex <amount> <from> <to>',ctx=>currency.run(ctx)));
const coins=['ethereum','dogecoin'].map(name=>define(name,`Get the ${name} spot price via CoinGecko.`,`${name} [currency]`,ctx=>{if(ctx.args.length>1)return ctx.reply(`⚠️ Usage: ${config.prefix}${name} [currency]`);return crypto.run({...ctx,args:[name,...ctx.args]});}));
coins.push(define('btc2usd','Convert a Bitcoin amount to indicative US dollars using CoinGecko.','btc2usd [amount]',async ctx=>{const n=ctx.args.length?amount(ctx.args[0]):1;if(ctx.args.length>1||n===null||n<0)return ctx.reply(`⚠️ Usage: ${config.prefix}btc2usd [non-negative amount]`);try{const url='https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true',r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok){await r.body?.cancel();throw Error();}const j=JSON.parse((await boundedBody(r,1024*1024)).toString('utf8')),v=j.bitcoin?.usd;if(typeof v!=='number'||!Number.isFinite(v)||v<0||!Number.isFinite(n*v))throw Error();const updated=Number.isFinite(j.bitcoin.last_updated_at)?new Date(j.bitcoin.last_updated_at*1000).toISOString():'not provided';await ctx.reply(`🪙 ${n} BTC ≈ ${Number((n*v).toPrecision(12))} USD\nPrice per BTC: ${v} USD\nUpdated: ${updated}\nSource: CoinGecko. Prices are indicative.`);}catch{await ctx.reply('⚠️ Bitcoin price unavailable or rate-limited. Source: CoinGecko.');}}));
module.exports=[...generic,...shortcuts,...targets,...foreign,...coins];
module.exports.calculate=calculate;
