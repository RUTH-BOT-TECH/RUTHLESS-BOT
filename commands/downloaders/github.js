const config=require('../../config');
const { parseGithubRepo, sendGitHub }=require('../../lib/autodl');
module.exports={
  name:'gitclone', aliases:[], category:'downloaders', description:'Download a public GitHub repository as a ZIP (max 50 MB). Source: GitHub.',
  usage:'gitclone <GitHub repository URL>', ownerOnly:false, adminOnly:false, groupOnly:false, cooldown:0,
  async run(ctx) {
    const repo=ctx.args.length===1 && parseGithubRepo(ctx.args[0]);
    if (!repo) return ctx.reply(`⚠️ Usage: ${config.prefix}gitclone <GitHub repository URL>\nExample: ${config.prefix}gitclone https://github.com/octocat/Hello-World`);
    await sendGitHub(ctx.sock,ctx.chat,ctx.msg,repo,ctx.reply);
  }
};
