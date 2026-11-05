'use strict';
const {target}=require('../../lib/group');
const {clean}=require('../../lib/owner');
const config=require('../../config'),reaction=require('../../lib/tickle');
// [provider category, action with target, action without target (if natural)]
const actions={
 hug:['hug','hugged'],kiss:['kiss','kissed'],pat:['pat','patted'],slap:['slap','slapped'],
 punch:['punch','punched'],bite:['bite','bit'],lick:['lick','licked'],cuddle:['cuddle','cuddled'],
 poke:['poke','poked'],wave:['wave','waved at','waved'],wink:['wink','winked at','winked'],
 smile:['smile','smiled at','smiled'],laugh:['laugh','laughed with','laughed'],cry:['cry','cried with','cried'],
 blush:['blush','blushed with','blushed'],dance:['dance','danced with','danced'],sleep:['sleep','slept beside','fell asleep'],
 happy:['happy','was happy with','was happy'],sad:['sad','was sad with','was sad'],shy:['shy','felt shy with','felt shy'],
 scared:['scared','felt scared with','felt scared'],surprised:['surprised','was surprised by','was surprised'],
 confused:['confused','was confused by','was confused'],shrug:['shrug','shrugged at','shrugged'],
 handhold:['handhold','held hands with'],nom:['nom','shared a snack with','ate a snack'],
 pout:['pout','pouted at','pouted'],smug:['smug','felt smug with','felt smug'],yawn:['yawn','yawned with','yawned'],
 angry:['mad','was angry with','was angry'],drink:['sip','had a drink with','had a drink'],eat:['nom','ate with','ate a snack'],
 highfive:['highfive','high-fived',null,'gifukai'],bored:['bored','was bored with','was bored','gifukai'],think:['think','thought about','was thinking','gifukai'],nod:['nod','nodded at','nodded','gifukai']
};
module.exports=Object.entries(actions).map(([name,[provider,verb,solo,api='otakugifs']])=>({
 name,aliases:[],category:'reactions',ownerOnly:false,adminOnly:false,groupOnly:false,cooldown:8,
 description:`Send a ${name} reaction GIF from ${api==='gifukai'?'Gifukai':'OtakuGIFs'}.`,usage:`${name}${solo?' [@person]':' @person (or reply)'}`,
 async run(ctx){
  const id=await target(ctx);
  if(!id&&!solo)return ctx.reply(`⚠️ Reply to or mention someone: ${config.prefix}${name} @person`);
  try{
   const video=await reaction.gif(provider,api),caption=id?`@${clean(ctx.sender)} ${verb} @${clean(id)}`:`@${clean(ctx.sender)} ${solo}`;
   await ctx.sock.sendMessage(ctx.chat,{video,gifPlayback:true,caption,mentions:id?[ctx.sender,id]:[ctx.sender]},{quoted:ctx.msg});ctx.markReplied();
  }catch(e){await ctx.reply(e.message.includes('busy')?'⏳ Reactions are busy. Try again shortly.':'⚠️ Reaction unavailable. Please try again.');}
 }
}));
