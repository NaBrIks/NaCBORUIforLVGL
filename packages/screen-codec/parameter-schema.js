// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {screenContract} from './contract.js';
import {integerRange as range,text} from '@lvgl-cbor/style-codec/values';
const numeric=new Set(['int32_t','uint32_t',...screenContract.widgets.flatMap(w=>w.methods.flatMap(m=>m.parameters)),...screenContract.common.methods.flatMap(m=>m.parameters)]);
const scalars=new Set(['text','bool','resource','points','number',...numeric]);
const descriptor=schema=>typeof schema==='string'?{type:schema}:schema;

// A bounded data shape for native method arguments. No expressions or executable schema.
export function validateParameterSchema(schema,depth=0){
 const s=descriptor(schema);
 if(depth>4||!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid parameter schema');
 if(s.title!==undefined&&(typeof s.title!=='string'||s.title.length>128))throw Error('Parameter title');
 if(s.type==='tuple'){
  if(!Array.isArray(s.items)||!s.items.length||s.items.length>16)throw Error('Tuple schema');
  s.items.forEach(item=>validateParameterSchema(item,depth+1));
 }else if(s.type==='array'){
  if(!range(s.minItems,0,32)||!range(s.maxItems,s.minItems,32))throw Error('Array schema bounds');
  validateParameterSchema(s.items,depth+1);
 }else if(s.type==='object'){
  if(!s.fields||typeof s.fields!=='object'||Array.isArray(s.fields)||Object.keys(s.fields).length>16)throw Error('Object parameter fields');
  for(const [key,field] of Object.entries(s.fields)){text(key,63,'Object parameter field');if(['__proto__','constructor','prototype'].includes(key))throw Error('Object parameter field');validateParameterSchema(field,depth+1);}
 }else if(s.type==='points'){
  const rule=screenContract.valueRules.points;
  if(!range(s.minItems??rule.minItems,rule.minItems,rule.maxItems)||!range(s.maxItems??rule.maxItems,s.minItems??rule.minItems,rule.maxItems)||!range(s.min??rule.min,rule.min,rule.max)||!range(s.max??rule.max,s.min??rule.min,rule.max))throw Error('Point schema bounds');
 }else if(!scalars.has(s.type))throw Error('Unknown parameter type '+s.type);
 const validBound=s.type==='number'?Number.isFinite:Number.isSafeInteger;
 if(s.min!==undefined&&!validBound(s.min)||s.max!==undefined&&!validBound(s.max)||s.min!==undefined&&s.max!==undefined&&s.min>s.max)throw Error('Parameter bounds');
 if(s.maxBytes!==undefined&&!range(s.maxBytes,1,4096))throw Error('Text schema bound');
 if(s.values!==undefined&&(!Array.isArray(s.values)||!s.values.length||s.values.length>32||s.values.some(v=>!validBound(v))))throw Error('Parameter choices');
 if(s.labels!==undefined&&(!s.values||!Array.isArray(s.labels)||s.labels.length!==s.values.length||s.labels.some(v=>typeof v!=='string'||v.length>128)))throw Error('Parameter choice labels');
 return schema;
}
export function convertParameter(value,schema,legacy={},name='argument'){
 const s={...legacy,...descriptor(schema)},type=s.type;
 if(type==='tuple'||type==='array'){
  if(!Array.isArray(value)||type==='tuple'&&value.length!==s.items.length||type==='array'&&!range(value.length,s.minItems,s.maxItems))throw Error('Array/tuple '+name);
  return value.map((v,i)=>convertParameter(v,type==='tuple'?s.items[i]:s.items,{},name+'['+i+']'));
 }
 if(type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(s.fields).length||Object.keys(value).some(key=>!Object.hasOwn(s.fields,key)))throw Error('Object '+name);
  return Object.fromEntries(Object.entries(s.fields).map(([key,field])=>{if(!Object.hasOwn(value,key))throw Error('Missing field '+name+'.'+key);return [key,convertParameter(value[key],field,{},name+'.'+key)];}));
 }
 if(type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||value<(s.min??-Number.MAX_VALUE)||value>(s.max??Number.MAX_VALUE)||s.values&&!s.values.includes(value))throw Error('Number '+name);return Object.is(value,-0)?0:value;}
 if(type==='text'||type==='resource')return text(value,s.maxBytes??(type==='text'?screenContract.valueRules.textBytesPerValue:63),name,type==='text');
 if(type==='bool'){if(typeof value!=='boolean')throw Error('Boolean '+name);return value;}
 if(type==='points'){
  const rule={...screenContract.valueRules.points,...s};
  if(!Array.isArray(value)||!range(value.length,rule.minItems,rule.maxItems)||value.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!range(n,rule.min,rule.max))))throw Error('Point path '+name);
  return value;
 }
 if(!scalars.has(type)||!range(value,s.min??(type==='uint32_t'||s.mask!==undefined?0:-2147483648),s.max??(type==='uint32_t'?4294967295:2147483647))||s.values&&!s.values.includes(value)||s.mask!==undefined&&(value&~s.mask)!==0)throw Error('Widget range '+name);
 return value;
}
export function parameterBytes(value,schema){
 const s=descriptor(schema);
 if(s.type==='text')return new TextEncoder().encode(value).length+1;
 if(s.type==='points')return value.length*8;
 if(s.type==='array'||s.type==='tuple')return value.reduce((n,v,i)=>n+parameterBytes(v,s.type==='tuple'?s.items[i]:s.items),0);
 if(s.type==='object')return Object.entries(s.fields).reduce((n,[key,field])=>n+parameterBytes(value[key],field),0);
 return 0;
}
export function methodSchema(method){return method.parameters.length===1?{...method,...descriptor(method.parameters[0])}:{type:'tuple',items:method.parameters};}
export function defaultParameter(schema){
 const s=descriptor(schema);
 if(s.type==='tuple')return s.items.map(defaultParameter);
 if(s.type==='array')return Array.from({length:s.minItems},()=>defaultParameter(s.items));
 if(s.type==='object')return Object.fromEntries(Object.entries(s.fields).map(([key,field])=>[key,defaultParameter(field)]));
 return s.type==='bool'?false:s.type==='text'||s.type==='resource'?'':s.type==='points'?Array.from({length:s.minItems??2},(_,i)=>{const n=Math.max(s.min??-32768,Math.min(s.max??32767,i));return [n,n];}):s.values?.[0]??Math.max(s.min??0,Math.min(s.max??0,0));
}
export function parameterType(schema){const s=descriptor(schema);return s.type==='array'?parameterType(s.items)+'[]':s.type==='tuple'?'['+s.items.map(parameterType).join(', ')+']':s.type==='object'?'{'+Object.entries(s.fields).map(([key,field])=>key+': '+parameterType(field)).join(', ')+'}':s.type;}
