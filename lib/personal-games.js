'use strict';
const {randomInt}=require('node:crypto');
const TTL=10*60*1000;
const key=(type,chat,sender)=>`game:personal:${type}:${chat}:${sender}`;
function shuffleDeck(){const deck=[];for(const suit of ['♠','♥','♦','♣'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])deck.push(rank+suit);for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function score(hand){let total=0,aces=0;for(const c of hand){const rank=c.slice(0,-1);if(rank==='A'){aces++;total+=11;}else total+=['J','Q','K'].includes(rank)?10:Number(rank);}while(total>21&&aces>0){total-=10;aces--;}return total;}
function colorGuess(answer,guess){const colors=Array(5).fill('⬛'),counts={};for(let i=0;i<5;i++)if(guess[i]===answer[i])colors[i]='🟩';else counts[answer[i]]=(counts[answer[i]]||0)+1;for(let i=0;i<5;i++)if(colors[i]==='⬛'&&counts[guess[i]]>0){colors[i]='🟨';counts[guess[i]]--;}return colors.join('');}
function zodiac(month,day){const cut=[20,19,21,20,21,21,23,23,23,23,22,22],signs=['Capricorn','Aquarius','Pisces','Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn'];return signs[month-1+(day>=cut[month-1]?1:0)];}
module.exports={TTL,key,shuffleDeck,score,colorGuess,zodiac};
