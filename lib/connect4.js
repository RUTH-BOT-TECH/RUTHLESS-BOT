'use strict';const W=7,H=6;
function drop(board,col,symbol){if(!Array.isArray(board)||board.length!==W*H||!Number.isInteger(col)||col<0||col>=W||!['X','O'].includes(symbol))throw Error('Invalid move');for(let row=H-1;row>=0;row--){let i=row*W+col;if(!board[i]){board[i]=symbol;return {row,col};}}return null;}
function hasWon(board,row,col,symbol){for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){let count=1;for(const direction of [-1,1])for(let n=1;n<4;n++){const x=col+direction*n*dx,y=row+direction*n*dy;if(x<0||x>=W||y<0||y>=H||board[y*W+x]!==symbol)break;count++;}if(count>=4)return true;}return false;}
function render(board){let s='1 2 3 4 5 6 7\n';for(let r=0;r<H;r++)s+=board.slice(r*W,r*W+W).map(x=>x||'·').join(' ')+'\n';return s.trim();}
module.exports={W,H,drop,hasWon,render};
