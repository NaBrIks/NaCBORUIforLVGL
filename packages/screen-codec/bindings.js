// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {object as only,text,integerRange} from '@lvgl-cbor/style-codec/values';
import {screenContract} from './contract.js';
import {bindingContract} from './binding-contract.js';
import {methodSchema} from './parameter-schema.js';
import {encodeWidgetMethod} from './widget-methods.js';
import {dataDescriptor,validateDataValue,validateBindingCapabilities,bindingCatalogIsAuthoritative,dataSchemaAtPath,validateDataPath,bindingText,bindingLimits} from './binding-schema.js';
import {inspectExpression,schemasCompatible,evaluateExpression,UNKNOWN} from './binding-expression.js';
import {validateNavigation} from './composition.js';

const L=bindingContract.limits;
export function bindingMethodCatalog(family){return [
 ...(family?.methods??[]).filter(m=>!m.retired).map(method=>({scope:'widget',method,schema:methodSchema(method)})),
 ...screenContract.common.methods.filter(m=>!m.retired).map(method=>({scope:'common',method,schema:methodSchema(method)}))
];}
export function methodDataSchema(schema){
 const s=typeof schema==='string'?{type:schema}:schema;
 if(s.type==='tuple')return {type:'tuple',items:s.items.map(methodDataSchema)};
 if(s.type==='array')return {...s,items:methodDataSchema(s.items)};
 if(s.type==='object')return {...s,fields:Object.fromEntries(Object.entries(s.fields).map(([key,field])=>[key,methodDataSchema(field)]))};
 if(s.type==='points')return {type:'array',minItems:screenContract.valueRules.points.minItems,maxItems:screenContract.valueRules.points.maxItems,items:{type:'tuple',items:[{type:'integer'},{type:'integer'}]}};
 return {...s,type:s.type==='resource'?'text':['bool','text','number'].includes(s.type)?s.type:'integer'};
}
export function eventValueSchema(family,event){
 return family?.events?.find(e=>e.name===event)?.value??null;
}
export function validateBindingFormat(format){
 only(format,['precision','prefix','suffix','unknown'],'Binding format');
 if(format.precision!==undefined&&!integerRange(format.precision,0,6))throw Error('Binding format precision');
 for(const key of ['prefix','suffix','unknown'])if(format[key]!==undefined)bindingText(format[key],128,'Binding format '+key,true);
 return format;
}
export function formatBindingValue(value,format={}){
 validateBindingFormat(format);if(value===UNKNOWN)return format.unknown??'--';
 if(value!==null&&!['number','string','boolean'].includes(typeof value))return format.unknown??'--';
 let rendered=String(value);
 if(typeof value==='number'){
  if(format.precision!==undefined){if(!Number.isFinite(value)||Math.abs(value)>=1e21)throw Error('binding_format_range');const scale=10**format.precision,product=value*scale,rounded=Number.isFinite(product)?Math.sign(product)*Math.floor(Math.abs(product)+.5)/scale:value;rendered=(rounded===0?0:rounded).toFixed(format.precision);}
  else{
   // C++ defaultfloat/setprecision(15), including its exponent threshold and spelling.
   let rounded=value;if(value!==0){const scale=10**(14-Math.floor(Math.log10(Math.abs(value)))),product=value*scale;if(Number.isFinite(scale)&&scale>0&&Number.isFinite(product)){const candidate=Math.sign(product)*Math.floor(Math.abs(product)+.5)/scale;if(Number.isFinite(candidate))rounded=candidate;}}
   const [mantissa,exponentText]=rounded.toExponential(14).split('e'),exponent=Number(exponentText);
   if(exponent>=-4&&exponent<15)rendered=rounded.toFixed(Math.max(0,14-exponent)).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
   else rendered=mantissa.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'')+'e'+(exponent<0?'-':'+')+String(Math.abs(exponent)).padStart(2,'0');
   if(value===0)rendered='0';
  }
 }
 const result=(format.prefix??'')+rendered+(format.suffix??'');
 text(result,L.textBytes,'Formatted binding text',true);return result;
}
function matchingMethod(family,rule){
 if(rule.scope!==undefined&&!['widget','common'].includes(rule.scope))throw Error('Binding method scope');
 text(rule.method,63,'Binding method');const scope=rule.scope??'widget',group=scope==='common'?screenContract.common:family;
 const method=group.methods.find(m=>!m.retired&&m.alias===rule.method);if(!method)throw Error('Unknown binding method '+scope+':'+rule.method);
 return {scope,group,method,schema:methodDataSchema(methodSchema(method))};
}
function validateBinding(rule,family,capabilities){
 only(rule,['scope','method','value','format'],'Node binding');if(!Object.hasOwn(rule,'value'))throw Error('Binding value');
 const target=matchingMethod(family,rule),inferred=inspectExpression(rule.value,{capabilities}).schema;
 const format=rule.format??(target.schema.type==='text'?{}:undefined);
 if(format!==undefined){validateBindingFormat(format);if(target.schema.type!=='text'||inferred&&['object','array','tuple'].includes(dataDescriptor(inferred).type))throw Error('Format requires scalar input and text target');}
 else if(!schemasCompatible(inferred,target.schema))throw Error('Binding method argument type: '+rule.method);
 const constant=evaluateExpression(rule.value);
 if(format!==undefined)validateDataValue(formatBindingValue(UNKNOWN,format),undefined,{limits:bindingLimits(capabilities)});
 if(constant!==UNKNOWN){const argument=format!==undefined?formatBindingValue(constant,format):constant;validateDataValue(argument,undefined,{limits:bindingLimits(capabilities)});encodeWidgetMethod(target.group,rule.method,argument);}
 return {method:target.method.opcode,value:rule.value,...format!==undefined?{format}:{}};
}
function validateEvent(rule,family,capabilities){
 const action=Object.hasOwn(rule,'action'),write=Object.hasOwn(rule,'write'),navigate=Object.hasOwn(rule,'navigate');if(Number(action)+Number(write)+Number(navigate)!==1)throw Error('Event requires action, write or navigate');
 only(rule,navigate?['event','navigate']:action?['event','action','args']:['event','write','value'],'Node event');
 if(!bindingContract.events.includes(rule.event)||!navigate&&bindingCatalogIsAuthoritative(capabilities)&&!capabilities.binding?.events.includes(rule.event))throw Error('Unavailable UI event');
 if(navigate){validateNavigation(rule.navigate,capabilities);return rule;}
 const context={capabilities,eventContext:true,eventSchema:eventValueSchema(family,rule.event)},authoritative=bindingCatalogIsAuthoritative(capabilities);
 if(action){
  bindingText(rule.action,63,'Event action');if(!Object.hasOwn(rule,'args'))throw Error('Event action args');
  const target=capabilities?.binding?.actions.find(a=>a.name===rule.action);if(!target&&authoritative)throw Error('Unknown event action '+rule.action);
  const schema=inspectExpression(rule.args,context).schema;if(target&&!schemasCompatible(schema,target.schema))throw Error('Action argument type');
  const constant=evaluateExpression(rule.args);if(constant!==UNKNOWN)validateDataValue(constant,target?.schema,{limits:bindingLimits(capabilities)});
 }else{
  only(rule.write,['source','path'],'Event write target');bindingText(rule.write.source,63,'Write source');validateDataPath(rule.write.path??[]);
  if(!Object.hasOwn(rule,'value'))throw Error('Event write value');const target=capabilities?.binding?.sources.find(s=>s.name===rule.write.source);
  if(authoritative&&(!target||!target.writable))throw Error('Event source is unavailable or read only');
  const schema=dataSchemaAtPath(target?.schema,rule.write.path??[]),actual=inspectExpression(rule.value,context).schema;
  if(!schemasCompatible(actual,schema))throw Error('Write value type');
  const constant=evaluateExpression(rule.value);if(constant!==UNKNOWN)validateDataValue(constant,schema,{limits:bindingLimits(capabilities)});
 }
 return rule;
}
export function encodeBindings(document,widgets,capabilities){
 if(document.bindings!==undefined&&(!Array.isArray(document.bindings)||document.bindings.length)||document.events!==undefined&&(!Array.isArray(document.events)||document.events.length))throw Error('Root authoring bindings/events must be empty; declare rules on nodes');
 let bindings=[],events=[];
 const walk=node=>{
  const family=widgets.find(w=>w.name===node.type);if(!family)throw Error('Binding widget type');
  for(const key of ['bindings','events'])if(node[key]!==undefined&&!Array.isArray(node[key]))throw Error('Node '+key+' array');
  const methods=new Set();for(const rule of node.bindings??[]){const normalized=validateBinding(rule,family,capabilities);if(methods.has(normalized.method))throw Error('Duplicate binding target method');methods.add(normalized.method);bindings.push({node:node.id,...normalized});}
  for(const rule of node.events??[])events.push({node:node.id,...validateEvent(rule,family,capabilities)});
  for(const child of node.children??[])walk(child);
 };
 const count=node=>(node.bindings?.length??0)+(node.events??[]).filter(rule=>!rule.navigate).length+(node.children??[]).reduce((n,c)=>n+count(c),0);
 if(count(document.root)){
  const catalog=validateBindingCapabilities(capabilities);if(bindingCatalogIsAuthoritative(capabilities)&&!catalog)throw Error('Device bindings unavailable');
 }
 walk(document.root);
 if(bindings.length>(capabilities?.binding?.limits?.bindings??L.bindings)||events.length>(capabilities?.binding?.limits?.events??L.events))throw Error('Binding/event count limit');
 return {bindings,...events.length?{events}:{},...bindings.length||events.length?{bindings_version:bindingContract.version}:{}};
}
const plain=value=>value instanceof Map?Object.fromEntries([...value].map(([key,item])=>[key,plain(item)])):Array.isArray(value)?value.map(plain):value;
export function decodeBindings(data,document,widgets){
 const bindings=data.bindings??[],events=data.events??[];
 if(!Array.isArray(bindings)||!Array.isArray(events))throw Error('Wire bindings/events array');
 if(bindings.length||events.length){if(data.bindings_version!==bindingContract.version)throw Error('Binding wire version');}
 else if(data.bindings_version!==undefined)throw Error('Empty binding version envelope');
 const nodes=new Map(),walk=node=>{nodes.set(node.id,node);for(const child of node.children??[])walk(child);};walk(document.root);
 for(const wire of bindings){
  const rule=plain(wire);only(rule,['node','method','value','format'],'Wire binding');const node=nodes.get(rule.node);if(!node)throw Error('Unknown binding node');
  const family=widgets.find(w=>w.name===node.type),scope=rule.method<=255?'common':'widget',group=scope==='common'?screenContract.common:family,method=group.methods.find(m=>!m.retired&&m.opcode===rule.method);
  if(!method)throw Error('Unknown binding method opcode');node.bindings??=[];node.bindings.push({...(scope==='common'?{scope}:{}),method:method.alias,value:rule.value,...Object.hasOwn(rule,'format')&&Object.keys(rule.format).length?{format:rule.format}:{}});
 }
 for(const wire of events){const rule=plain(wire),node=nodes.get(rule.node);if(!node)throw Error('Unknown event node');delete rule.node;node.events??=[];node.events.push(rule);}
 return document;
}
