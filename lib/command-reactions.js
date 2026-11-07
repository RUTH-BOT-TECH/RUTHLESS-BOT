'use strict';
// A reaction acknowledges receipt, not success. Aliases share their command's
// meaning, while an explicit mapping takes precedence over the category.
const BY_COMMAND=Object.freeze({
 ai:'🧠',aiinfo:'🧠',clearchat:'🧹',askpdf:'📄',studyquiz:'📚',
 translate:'🌐','translate-reply':'🌐',ocr:'🔎',transcribe:'🎙️',vision:'👁️',
 imagine:'🎨','img2img':'🎨',aiavatar:'🎨',tts:'🔊',
 ytplay:'🎵',ytmp3:'🎵',tiktokmp3:'🎵',soundcloud:'🎵',bandcamp:'🎵',mixcloud:'🎵',
 spotify:'🎵',spotifysearch:'🎵',deezer:'🎵',applemusic:'🎵',tidal:'🎵',
 ytmp4:'🎬',ytshort:'🎬',video:'🎬',ytdoc:'📄',yts:'🔎',
 menu:'📖',help:'📖',ping:'🏓',alive:'💚',
 taskboard:'📋',eventrsvp:'📅',groupdigest:'📝',welcome:'👋',goodbye:'🕊️',stickercollect:'🧩',
 slap:'👋',hug:'🤗',kiss:'💋',pat:'🫶',punch:'🥊',
 note:'📝',todo:'📋',remind:'⏰',timer:'⏱️',alarm:'⏰',
 weather:'🌤️',forecast:'🌤️',screenshot:'📸',qrread:'📷',barcode:'📷'
});
const BY_CATEGORY=Object.freeze({
 ai:'🧠',downloaders:'📥',audio:'🎵',video:'🎬',media:'🎬',games:'🎮',
 group:'👥',owner:'🛠️',general:'⚡',tools:'🛠️',search:'🔎',
 converters:'🔄',anime:'🌸',textmaker:'🎨',reactions:'✨',economy:'💰',social:'🌍',misc:'🧩'
});
function reactionFor(command,invoked,args=[]){
 if(invoked==='ask'&&typeof args[0]==='string'&&args[0].toLowerCase()==='pdf')return '📄';
 return BY_COMMAND[command?.name]||BY_CATEGORY[command?.category]||'⚡';
}
module.exports={reactionFor};
