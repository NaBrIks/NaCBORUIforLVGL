// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encodeStyle} from '@lvgl-cbor/style-codec';
import {encodeScreen,screenContract} from '@lvgl-cbor/screen-codec';
import {checkStyleCapabilities} from '@lvgl-cbor/style-codec';
import {parseCss} from './parser.js';
import {declaration,expandProperties,validateProperties,exportDeclarations} from './values.js';
export {parseCss} from './parser.js';

const states={pressed:'PRESSED',checked:'CHECKED',focused:'FOCUSED','focus-visible':'FOCUS_KEY',disabled:'DISABLED','user-1':'USER_1','user-2':'USER_2','user-3':'USER_3','user-4':'USER_4'};
function selector(source){
 const match=/^(?:(\*|[a-z][a-z0-9_-]*)|(#([\p{L}\p{N}_-]+))|(:root))?((?::[a-z][a-z0-9-]*)*)(?:::(main|scrollbar|indicator|knob|selected|items|cursor))?$/u.exec(source);
 if(!match||(!match[1]&&!match[3]&&!match[4]))throw Error('Unsupported selector '+source+'; use #id, widget type, * or :root with :state and ::part');
 const state=match[5]?match[5].slice(1).split(':').map(s=>{if(!Object.hasOwn(states,s))throw Error('Unsupported state :'+s);return states[s];}):[];
 const part=(match[6]??'main').toUpperCase();if(!Object.hasOwn(screenContract.parts,part))throw Error('Unsupported part '+part);
 return {type:match[1],id:match[3],root:!!match[4],state:[...new Set(state)].sort(),part,specificity:(match[3]?100:(match[4]?10:match[1]==='*'?0:1))+(match[6]?1:0)};
}
const flatten=(node,parent=null)=>[{node,parent},...(node.children??[]).flatMap(child=>flatten(child,node))];
const cssId=id=>{if(!/^[\p{L}\p{N}_-]+$/u.test(id))throw Error('ID cannot be represented by CSS subset: '+id);return '#'+id;};
const result=(document,diagnostics,changes)=>({ok:diagnostics.length===0,document:diagnostics.length?undefined:document,diagnostics,changes});
export function importCss(source,{kind='screen',document,capabilities}={}){
 const diagnostics=[];let rules;
 try{rules=parseCss(source,{declarations:kind==='style'&&!source.includes('{')});}catch(e){return result(null,[{message:e.message}],0);}
 if(!['screen','style'].includes(kind))return result(null,[{message:'Unknown document kind'}],0);
 let output,nodes;
 try{output=JSON.parse(JSON.stringify(document));nodes=kind==='screen'?flatten(output.root):[{node:{id:':root',type:'obj',style:output.props??{}},parent:null}];}catch(e){return result(null,[{message:'Invalid document: '+e.message}],0);}
 const winners=new Map();let changes=0,order=0;
 for(const rule of rules){
  try{
   const s=selector(rule.selector);if(kind==='style'&&(s.state.length||s.part!=='MAIN'||!(s.root||s.type==='*')))throw Error('Named style accepts declarations, :root or * only');
   const matches=nodes.filter(({node,parent})=>s.root?!parent:s.id?node.id===s.id:s.type==='*'||node.type===s.type);
   if(!matches.length)throw Error('Selector matches no objects: '+rule.selector);
   for(const d of rule.declarations){
    try{const props=declaration(d.property,d.value);validateProperties(props);checkStyleCapabilities(props,capabilities);
     for(const {node} of matches){const key=JSON.stringify([node.id,s.part,s.state]),entry=winners.get(key)??{node,part:s.part,state:s.state,props:new Map()};winners.set(key,entry);
      for(const [key,value] of Object.entries(props)){const rank=[d.important?1:0,s.specificity+s.state.length*10,order++],prev=entry.props.get(key);if(!prev||rank[0]>prev.rank[0]||rank[0]===prev.rank[0]&&(rank[1]>prev.rank[1]||rank[1]===prev.rank[1]&&rank[2]>=prev.rank[2]))entry.props.set(key,{value,rank});}
     }
    }catch(e){diagnostics.push({selector:rule.selector,line:d.line,property:d.property,message:e.message});}
   }
  }catch(e){diagnostics.push({selector:rule.selector,message:e.message});}
 }
 for(const entry of winners.values()){
  const props=Object.fromEntries([...entry.props].map(([k,v])=>[k,v.value]));changes+=Object.keys(props).length;
  if(kind==='style')output.props={...expandProperties(output.props??{}),...props};
  else if(entry.part==='MAIN'&&!entry.state.length)entry.node.style={...expandProperties(entry.node.style??{}),...props};
  else {const rules=entry.node.styleRules??=[];let rule=rules.find(r=>(r.part??'MAIN').replace(/^LV_PART_/,'')===entry.part&&JSON.stringify([...(r.state??[])].map(x=>x.replace(/^LV_STATE_/,'' )).sort())===JSON.stringify(entry.state));if(!rule){rule={part:entry.part,state:entry.state,props:{}};rules.push(rule);}rule.props={...expandProperties(rule.props),...props};}
 }
 try{if(kind==='screen')encodeScreen(output,'css-check',capabilities);else encodeStyle(output,'css-check',capabilities);}catch(e){diagnostics.push({message:e.message});}
 return result(output,diagnostics,changes);
}
export function exportCss(document,{kind='screen'}={}){
 if(kind==='style'){if(document.copy!=null||document.merge?.length)throw Error('CSS cannot flatten copy/merge; use JSON/CBOR or remove composition');return ':root {\n'+exportDeclarations(document.props??{})+'\n}\n';}
 if(kind!=='screen')throw Error('Unknown document kind');
 if(Object.keys(document.styles??{}).length)throw Error('CSS export of named screen styles is unsupported; use JSON/CBOR');
 const blocks=[];
 for(const {node} of flatten(document.root)){
  if(node.styles?.length)throw Error('CSS export of style references is unsupported; use JSON/CBOR');
  const id=cssId(node.id);
  if(Object.keys(node.style??{}).length)blocks.push(id+' {\n'+exportDeclarations(node.style)+'\n}');
  for(const rule of node.styleRules??[]){const part=(rule.part??'MAIN').replace(/^LV_PART_/,'');if(!Object.hasOwn(screenContract.parts,part))throw Error('Unknown part');const state=(rule.state??[]).map(value=>{const name=Object.keys(states).find(key=>states[key]===value.replace(/^LV_STATE_/,''));if(!name)throw Error('CSS export unsupported state '+value);return ':'+name;}).join('');blocks.push(id+state+(part==='MAIN'?'':'::'+part.toLowerCase())+' {\n'+exportDeclarations(rule.props)+'\n}');}
 }
 if(!blocks.length)throw Error('No CSS properties to export');return blocks.join('\n\n')+'\n';
}
