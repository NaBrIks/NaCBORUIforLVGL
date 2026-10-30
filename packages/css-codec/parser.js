// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Strict, bounded CSS subset. Never executes CSS or fetches URLs.
export const cssMaxBytes=256*1024;
export function parseCss(source,{declarations=false}={}){
 if(typeof source!=='string'||!source.trim()||new TextEncoder().encode(source).length>cssMaxBytes)throw Error('CSS: empty input or exceeds 256 KiB');
 let text='',quoted='',comment=false;
 for(let i=0;i<source.length;i++){const c=source[i],next=source[i+1];
  if(comment){if(c==='*'&&next==='/'){text+='  ';i++;comment=false;}else text+=c==='\n'?'\n':' ';continue;}
  if(quoted){text+=c;if(c===quoted)quoted='';continue;}
  if(c==='"'||c==="'"){quoted=c;text+=c;continue;}
  if(c==='/'&&next==='*'){comment=true;text+='  ';i++;continue;}text+=c;
 }
 if(comment)throw Error('CSS: unterminated comment');
 if(/[@{}]/.test(declarations?text:'')||/@/.test(text))throw Error('CSS: at-rules and nested rules are unsupported');
 if(/(?:url|var|calc|expression)\s*\(/i.test(text)||/\\/.test(text))throw Error('CSS: url(), var(), calc(), escapes and expressions are unsupported');
 const rules=[];
 function parseBody(body,offset){
  const result=[];let start=0,quote='',parens=0;
  for(let i=0;i<=body.length;i++){
   const ch=body[i];
   if(quote){if(ch===quote)quote='';}
   else if(ch==='"'||ch==="'")quote=ch;
   else if(ch==='(')parens++;
   else if(ch===')'){if(--parens<0)throw Error('CSS: unbalanced parentheses');}
   else if((ch===';'||i===body.length)&&!parens){
    const raw=body.slice(start,i).trim();
    if(raw){const match=/^([a-z-]+)\s*:\s*([\s\S]+)$/i.exec(raw);if(!match)throw Error('CSS: expected property: value');
     const important=/\s*!important\s*$/i.test(match[2]);
     result.push({property:match[1].toLowerCase(),value:match[2].replace(/\s*!important\s*$/i,'').trim(),important,line:source.slice(0,offset+start+body.slice(start,i).search(/\S/)).split('\n').length});}
    start=i+1;
   }
  }
  if(quote||parens)throw Error('CSS: unterminated string or parentheses');
  if(!result.length)throw Error('CSS: empty declaration block');return result;
 }
 if(declarations)return [{selector:':root',declarations:parseBody(text,0)}];
 let pos=0;
 while(pos<text.length){if(!text.slice(pos).trim())break;const open=text.indexOf('{',pos),close=text.indexOf('}',open+1);
  if(open<0||close<0||text.slice(open+1,close).includes('{'))throw Error('CSS: expected flat selector { declarations }');
  const selector=text.slice(pos,open).trim();if(!selector||selector.includes('}'))throw Error('CSS: missing selector');
  const body=parseBody(text.slice(open+1,close),open+1);
  for(const item of selector.split(',')){if(!item.trim())throw Error('CSS: empty selector');rules.push({selector:item.trim(),declarations:body});}
  if(rules.length>512)throw Error('CSS: rule limit 512');pos=close+1;
 }
 return rules;
}
