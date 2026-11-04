'use strict';
// Recursive descent: no eval, functions, properties, or arbitrary code execution.
function calculate(input){
 if(typeof input!=='string'||!input.trim()||input.length>200)throw Error('Invalid expression');
 const tokens=input.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/%^]|\s+|./gi)||[];let at=0,depth=0;const list=tokens.filter(t=>!/^\s+$/.test(t));
 function checked(n){if(!Number.isFinite(n)||Math.abs(n)>1e100)throw Error('Result out of range');return n;}
 function primary(){const t=list[at++];if(t==='('){if(++depth>25)throw Error('Expression too deep');const x=expr();if(list[at++]!==')')throw Error('Missing parenthesis');depth--;return x;}if(!t||!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(t))throw Error('Invalid expression');return checked(Number(t));}
 function power(){let a=primary();if(list[at]==='^'){at++;a=checked(a**unary());}return a;}
 function unary(){if(list[at]==='+'||list[at]==='-'){const sign=list[at++];return checked((sign==='-'?-1:1)*unary());}return power();}
 function term(){let a=unary();while(['*','/','%'].includes(list[at])){const op=list[at++],b=unary();a=checked(op==='*'?a*b:op==='/'?a/b:a%b);}return a;}
 function expr(){let a=term();while(list[at]==='+'||list[at]==='-'){const op=list[at++],b=term();a=checked(op==='+'?a+b:a-b);}return a;}
 const result=expr();if(at!==list.length)throw Error('Invalid expression');return Number(result.toPrecision(14));
}
module.exports={calculate};
