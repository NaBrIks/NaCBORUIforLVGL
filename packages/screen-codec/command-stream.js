import {screenContract} from './contract.js';
import {orderWidgetMethods} from './widget-catalog.js';
const C=screenContract.commands;
// Only the PC constructs this temporary normalized tree. MCU reads the command arrays directly.
export function encodeNodeCommands(node,captions={}) {
 if(node instanceof Map)node=Object.fromEntries(node);
 const body=[[C.set_id,node.id],...(node.common??[]),...(node.widget??[])];
 for(let use of node.styles??[]){if(use instanceof Map)use=Object.fromEntries(use);body.push([C.style_ref,[use.selector,use.ref]]);}
 if(node.style!==undefined)body.push([C.style,[0,node.style]]);
 for(let rule of node.rules??[]){if(rule instanceof Map)rule=Object.fromEntries(rule);body.push([C.style,[rule.selector,rule.methods]]);}
 for(const child of node.children??[])body.push(encodeNodeCommands(child,captions));
 if(node.caption!==undefined)Object.defineProperty(captions,node.id,{value:node.caption,enumerable:true});
 return [C.create,node.extension?[node.type,node.extension]:node.type,body];
}
export function decodeNodeCommands(command,widgets,captions=new Map(),depth=1) {
 if(depth>screenContract.limits.depth||!Array.isArray(command)||command.length!==3||command[0]!==C.create||!Array.isArray(command[2]))throw Error('Create command');
 const descriptor=command[1],extension=Array.isArray(descriptor);
 if(extension&&descriptor.length!==2)throw Error('Extension type');
 const type=extension?descriptor[0]:descriptor;
 const family=widgets.find(w=>typeof type==='string'?w.name===type:w.id===type);
 if(!family)throw Error('Widget ID');
 if(family.abi!==(extension?descriptor[1]:undefined))throw Error('Extension ABI mismatch');
 const n=new Map([['type',family.id],['common',new Map()],['widget',new Map()],['styles',[]],['children',[]]]);
 if(extension)n.set('extension',descriptor[1]);
 let stage=-1;
 for(const op of command[2]){
  if(!Array.isArray(op)||!Number.isInteger(op[0])||op[0]<0||op[0]>65535)throw Error('Command opcode');
  const [code,arg]=op;
  const nextStage=code===C.set_id?0:code===C.create?5:code===C.style_ref?3:code===C.style?4:code<=255?1:2;
  if(nextStage<stage)throw Error('Command order cannot be represented by declarative JSON');
  stage=nextStage;
  if(code===C.create){n.get('children').push(decodeNodeCommands(op,widgets,captions,depth+1));continue;}
  if(op.length!==2)throw Error('Command arguments');
  if(code===C.set_id){if(n.has('id'))throw Error('Duplicate node ID command');n.set('id',arg);}
  else if(code===C.style||code===C.style_ref){
   if(!Array.isArray(arg)||arg.length!==2)throw Error('Style command');
   const [selector,value]=arg;
   if(code===C.style_ref)n.get('styles').push(new Map([['selector',selector],['ref',value]]));
   else if(selector===0&&!n.has('style')&&!n.has('rules'))n.set('style',value);
   else {if(!n.has('rules'))n.set('rules',[]);n.get('rules').push(new Map([['selector',selector],['methods',value]]));}
  } else {
   const target=n.get(code<=255?'common':'widget');
   if(target.has(code))throw Error('Repeated method cannot be represented by declarative JSON');
   target.set(code,arg);
  }
 }
 for(const [key,group] of [['common',screenContract.common],['widget',family]]){
  const methods=n.get(key);
  if(JSON.stringify([...methods.keys()])!==JSON.stringify([...orderWidgetMethods(methods,group).keys()]))throw Error('Method order cannot be represented by declarative JSON');
 }
 if(captions.has(n.get('id')))n.set('caption',captions.get(n.get('id')));
 return n;
}
