// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encode} from 'cborg';
import {encodeNodeCommands} from './command-stream.js';
import {contract,encodeMethods as encodeScreenStyles,styleReference} from '@lvgl-cbor/style-codec';
import {integerRange as range,text,object as only} from '@lvgl-cbor/style-codec/values';
import {screenContract} from './contract.js';
import {checkScreenCapabilities} from './capabilities.js';
import {encodeSelector as selector} from './selectors.js';
import {encodeWidgetMethod} from './widget-methods.js';
import {widgetCatalog,orderWidgetMethods} from './widget-catalog.js';
import {validateLayout} from './layout-validation.js';
import {parameterBytes} from './parameter-schema.js';
import {encodeBindings} from './bindings.js';
import {encodeViews} from './composition.js';
export function encodeScreen(document,id,capabilities){
 only(document,['format','id','name','size','theme','styles','root','bindings','events'],'Screen document');if(document.format!=='lvgl-screen-draft-1')throw Error('Screen format');
 text(document.id,63,'Screen ID');text(document.name,128,'Screen display name');only(document.size,['width','height'],'Size');for(const value of Object.values(document.size))if(!range(value,1,8192))throw Error('Screen size');if(!range(document.size.width,1,8192)||!range(document.size.height,1,8192))throw Error('Screen size');
 if(document.theme!==undefined&&!['device','none'].includes(document.theme))throw Error('Theme');
 const widgets=widgetCatalog(capabilities);
 let nodeCount=0,textBytes=0,styleCount=0;const ids=new Set();
 function collect(node,depth,path){if(depth>screenContract.limits.depth||++nodeCount>screenContract.limits.nodes)throw Error('Node/depth limit at '+path);text(node?.id,63,'Node ID at '+path);if(ids.has(node.id))throw Error('Duplicate node ID '+node.id+' at '+path);ids.add(node.id);if(node.children!==undefined&&!Array.isArray(node.children))throw Error('children array at '+path);for(const [index,child] of (node.children??[]).entries())collect(child,depth+1,path+'.children['+index+']');}
 collect(document.root,1,'root');if(document.styles!==undefined)only(document.styles,Object.keys(document.styles),'Styles object');checkScreenCapabilities(document,capabilities);const namedStyles=new Set(Object.keys(document.styles??{}));
 function node(source,depth=1){
   only(source,['id','type','props','common','flags','style','styles','styleRules','children','bindings','events','view'],'Unknown node field');const family=widgets.find(w=>w.name===source.type);if(!family)throw Error('Unsupported widget '+source.type);
  const out={id:source.id,type:family.id,common:new Map(),widget:new Map(),styles:[],children:[]};if(family.abi)out.extension=family.abi;const props=source.props??{};only(props,Object.keys(props),'Widget props');for(const [name,value] of Object.entries(source.common??{}))out.common.set(...encodeWidgetMethod(screenContract.common,name,value));if(source.flags!==undefined)only(source.flags,Object.keys(source.flags),'Flags object');if(source.common!==undefined)only(source.common,Object.keys(source.common),'Common object');let add=0,remove=0;
  for(const [flag,enabled] of Object.entries(source.flags??{})){if(!Object.hasOwn(screenContract.flags,flag)||typeof enabled!=='boolean')throw Error('Unknown flag '+flag);if(enabled)add|=screenContract.flags[flag];else remove|=screenContract.flags[flag];}
  const setCommon=(name,value)=>{const [key,arg]=encodeWidgetMethod(screenContract.common,name,value);out.common.set(key,(out.common.get(key)??0)|arg);};if(add)setCommon('add_flags',add);if(remove)setCommon('remove_flags',remove);
  if(!family.abi&&props.checked!==undefined){if(!['switch','checkbox'].includes(source.type)||typeof props.checked!=='boolean')throw Error('checked');setCommon(props.checked?'add_state':'remove_state',screenContract.states.CHECKED);}
  for(const [a,b] of [['add_flags','remove_flags'],['add_state','remove_state']]){const opcode=name=>screenContract.common.methods.find(m=>m.alias===name).opcode;if((out.common.get(opcode(a))??0)&(out.common.get(opcode(b))??0))throw Error('Contradictory flags or states');}
  const addWidget=(name,value)=>{const [key,argument]=encodeWidgetMethod(family,name,value);if(out.widget.has(key))throw Error('Overlapping widget operation '+name);out.widget.set(key,argument);const method=family.methods.find(m=>m.opcode===key),values=method.parameters.length===1?[argument]:argument;for(let i=0;i<values.length;i++)textBytes+=parameterBytes(values[i],method.parameters[i]);};
  if(!family.abi&&(props.min!==undefined||props.max!==undefined))addWidget('range',[props.min??0,props.max??100]);
  for(const [key,raw] of Object.entries(props)){
   if(!family.abi&&['min','max','checked'].includes(key))continue;if(source.type==='button'&&key==='text')continue;if(!family.abi&&key==='src'&&raw==='')continue;
   const value=!family.abi&&key==='options'?(Array.isArray(raw)&&raw.every(v=>typeof v==='string'&&!v.includes('\n'))?raw.join('\n'):(()=>{throw Error('Options array');})()):raw;
   addWidget(key,value);
  }
  if(!family.abi&&props.selected!==undefined&&Array.isArray(props.options)&&!range(props.selected,0,Math.max(0,props.options.length-1)))throw Error('Dropdown selection');
  if(source.style){out.style=encodeScreenStyles(source.style);styleCount++;}
  if(source.styles!==undefined&&!Array.isArray(source.styles))throw Error('Style uses array');if(source.styleRules!==undefined&&!Array.isArray(source.styleRules))throw Error('Style rules array');
  if((source.styles?.length??0)>screenContract.valueRules.maxStyleUses||(source.styleRules?.length??0)>screenContract.valueRules.maxStyleUses)throw Error('Style uses/rules limit');
  for(const use of source.styles??[]){only(use,['ref','part','state'],'Style reference');text(use.ref,79,'Style reference');if(use.ref.startsWith('screen:')&&!namedStyles.has(use.ref.slice(7)))throw Error('Unknown screen style '+use.ref);styleReference(use.ref);out.styles.push({ref:use.ref,selector:selector(use)});}
  if(source.styleRules){out.rules=source.styleRules.map(rule=>{only(rule,['part','state','props'],'Style rule');if(!Object.hasOwn(rule,'props'))throw Error('Style rule props');styleCount++;return {selector:selector(rule),methods:encodeScreenStyles(rule.props)};});}
  out.children=(source.children??[]).map(child=>node(child,depth+1));
  if(source.type==='button'&&props.text!==undefined){text(props.text,screenContract.valueRules.textBytesPerValue,'Button text',true);let n=0,caption;do{caption='__caption_'+n++;}while(ids.has(caption));ids.add(caption);out.caption=caption;if(++nodeCount>screenContract.limits.nodes||depth>=screenContract.limits.depth)throw Error('Node/depth limit');out.children.push(node({id:caption,type:'label',props:{text:props.text},style:{align:'LV_ALIGN_CENTER'}},depth+1));}
  out.common=orderWidgetMethods(out.common,screenContract.common);
  out.widget=orderWidgetMethods(out.widget,family);
  return out;
 }
 const styles=Object.entries(document.styles??{}).map(([name,style])=>{text(name,63,'Style ID');only(style,['props'],'Style definition');styleCount++;return {id:name,methods:encodeScreenStyles(style.props)};});
 const root=node(document.root);validateLayout(root,null,new Map(styles.map(s=>[s.id,s.methods])));if(textBytes>Math.min(screenContract.limits.textBytes,capabilities?.limits.textBytes??screenContract.limits.textBytes)||styleCount>Math.min(screenContract.limits.styles,capabilities?.limits.styles??screenContract.limits.styles))throw Error('Screen memory limits');
 const captions={};const program=encodeNodeCommands(root,captions);
  const packet={v:screenContract.version,kind:'screen',id:text(id,47,'Request ID'),abi:screenContract.sha256,style_abi:contract.sha256,name:document.id,title:document.name,size:[document.size.width,document.size.height],theme:document.theme!=='none',styles,root:program,...encodeBindings(document,widgets,capabilities),...encodeViews(document,capabilities),...(Object.keys(captions).length?{captions}:{})};
 const bytes=encode(packet,{mapSorter:null});if(bytes.length>Math.min(screenContract.limits.packetBytes,capabilities?.limits.screenPacketBytes??screenContract.limits.packetBytes))throw Error('Screen packet too large');return bytes;
}
