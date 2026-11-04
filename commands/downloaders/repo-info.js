const {parseGithubRepo}=require('../../lib/autodl');
const config=require('../../config');
module.exports={name:'github',aliases:[],category:'downloaders',description:'Look up a public GitHub repository.',usage:'github <GitHub repository URL>',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:5,async run(ctx){
 const repo=ctx.args.length===1&&parseGithubRepo(ctx.args[0]);
 if(!repo)return ctx.reply(`⚠️ Usage: ${config.prefix}github <GitHub repository URL>\nExample: ${config.prefix}github https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT`);
 try{const r=await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`,{headers:{'User-Agent':'Ruthless-MD/1.0',Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const x=await r.json();await ctx.reply(`📦 ${x.full_name}\n${(x.description||'No description').slice(0,300)}\n⭐ ${x.stargazers_count} | 🍴 ${x.forks_count}\nLanguage: ${x.language||'Not specified'}\n${x.html_url}\nSource: GitHub API`);}catch{await ctx.reply('⚠️ GitHub repository information is unavailable. Try again later.');}
}};
