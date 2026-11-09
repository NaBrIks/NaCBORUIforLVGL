// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encode} from 'cborg';
import {object as only,text,integerRange} from '@lvgl-cbor/style-codec/values';
import {bindingContract} from './binding-contract.js';

const L=bindingContract.limits;
export const bindingLimits=capabilities=>({...L,...capabilities?.binding?.limits});
export const dataDescriptor=schema=>typeof schema==='string'?{type:schema}:schema;
export function bindingText(value,max,label='Binding text',empty=false){
 text(value,max,label,empty);for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error(label+' UTF-8');}else if(code>=0xdc00&&code<=0xdfff)throw Error(label+' UTF-8');}return value;
}
const safeKey=key=>{bindingText(key,63,'Data field');if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe data field');};
export function validateDataSchema(schema,depth=0,budget={nodes:0,bytes:0}){
 const s=dataDescriptor(schema);only(s,['type','title','description','unit','nullable','min','max','maxBytes','minItems','maxItems','fields','items'],'Data schema');
 if(depth>L.schemaDepth||!bindingContract.schemaTypes.includes(s.type))throw Error('Data schema type/depth');
 for(const [key,max] of [['title',128],['description',512],['unit',32]])if(s[key]!==undefined){bindingText(s[key],max,'Data schema '+key,true);budget.bytes+=new TextEncoder().encode(s[key]).length;}
 if(s.nullable!==undefined&&typeof s.nullable!=='boolean')throw Error('Data nullable');
 if(++budget.nodes>1024||budget.bytes>32768)throw Error('Data schema budget');
 if(['integer','number'].includes(s.type)){
  const check=s.type==='integer'?Number.isSafeInteger:Number.isFinite;
  if(s.min!==undefined&&!check(s.min)||s.max!==undefined&&!check(s.max)||s.min!==undefined&&s.max!==undefined&&s.min>s.max)throw Error('Data schema numeric bounds');
 }else if(s.min!==undefined||s.max!==undefined)throw Error('Data schema numeric bounds');
 if(s.type==='text'){if(s.maxBytes!==undefined&&!integerRange(s.maxBytes,1,L.textBytes))throw Error('Data text bound');}
 else if(s.maxBytes!==undefined)throw Error('Data text bound');
 if(s.type==='array'){
  if(!integerRange(s.minItems??0,0,L.arrayItems)||!integerRange(s.maxItems,s.minItems??0,L.arrayItems))throw Error('Data array bounds');
  validateDataSchema(s.items,depth+1,budget);
 }else if(s.items!==undefined||s.minItems!==undefined||s.maxItems!==undefined)throw Error('Data array fields');
 if(s.type==='object'){
  only(s.fields,Object.keys(s.fields??{}),'Data object fields');if(Object.keys(s.fields).length>L.objectFields)throw Error('Data object fields limit');
  for(const [key,field] of Object.entries(s.fields)){safeKey(key);budget.bytes+=new TextEncoder().encode(key).length;validateDataSchema(field,depth+1,budget);}
 }else if(s.fields!==undefined)throw Error('Data object fields');
 return schema;
}
export function validateDataValue(value,schema,{limits=L}={}){
 limits={...L,...limits};
 function walk(v,shape,depth){
  if(depth>limits.valueDepth)throw Error('Data value depth');
  const s=shape===undefined?null:dataDescriptor(shape);
  if(v===null&&s?.nullable)return;
  const type=v===null?'null':Array.isArray(v)?'array':typeof v==='boolean'?'bool':typeof v==='string'?'text':typeof v==='number'?'number':'object';
  if(s&&s.type!==type&&!(s.type==='integer'&&type==='number'&&Number.isSafeInteger(v)))throw Error('Data value type: '+s.type);
  if(type==='number'){if(!Number.isFinite(v)||s?.type==='integer'&&!Number.isSafeInteger(v)||v<(s?.min??-Number.MAX_VALUE)||v>(s?.max??Number.MAX_VALUE))throw Error('Data numeric value');}
  else if(type==='text')bindingText(v,Math.min(s?.maxBytes??limits.textBytes,limits.textBytes),'Data text',true);
  else if(type==='array'){
   if(v.length<(s?.minItems??0)||v.length>Math.min(s?.maxItems??limits.arrayItems,limits.arrayItems))throw Error('Data array length');
   v.forEach(item=>walk(item,s?.items,depth+1));
  }else if(type==='object'){
   only(v,Object.keys(s?.fields??v??{}),'Data object value');if(Object.keys(v).length>limits.objectFields)throw Error('Data object field limit');
   for(const [key,item] of Object.entries(v)){safeKey(key);walk(item,s?.fields?.[key],depth+1);}
  }
 }
 walk(value,schema,0);if(encode(value).length>limits.valueBytes)throw Error('Data value byte limit');return value;
}
export function validateDataPath(path=[]){
 if(!Array.isArray(path)||path.length>L.pathDepth)throw Error('Data path');
 for(const part of path){if(typeof part==='string')safeKey(part);else if(!integerRange(part,0,L.arrayItems-1))throw Error('Data path index');}
 return path;
}
export function dataSchemaAtPath(schema,path=[]){
 validateDataPath(path);let current=schema;
 for(const part of path){
  if(current===undefined)return undefined;const s=dataDescriptor(current);
  if(s.type==='object'&&typeof part==='string'&&Object.hasOwn(s.fields,part))current=s.fields[part];
  else if(s.type==='array'&&Number.isSafeInteger(part)&&part<s.maxItems)current=s.items;
  else throw Error('Unknown data path '+path.map(p=>typeof p==='number'?'['+p+']':p).join('.'));
 }
 return current;
}
export function defaultDataValue(schema){
 const s=dataDescriptor(schema??'text');
 if(s.type==='null')return null;if(s.type==='bool')return false;if(s.type==='text')return '';
 if(s.type==='object')return Object.fromEntries(Object.entries(s.fields).map(([key,field])=>[key,defaultDataValue(field)]));
 if(s.type==='array')return Array.from({length:s.minItems??0},()=>defaultDataValue(s.items));
 if(s.type==='tuple')return s.items.map(defaultDataValue);
 return Math.max(s.min??0,Math.min(s.max??0,0));
}
export const bindingCatalogIsAuthoritative=capabilities=>!!capabilities&&!['offline','offline-cache'].includes(capabilities.source);
export function validateBindingCapabilities(capabilities){
 const catalog=capabilities?.binding;if(catalog===undefined)return null;
 only(catalog,['version','sha256','sources','actions','events','limits','groups','catalogRevision','catalogLimits'],'Binding capabilities');if(catalog.version!==bindingContract.version||catalog.sha256!==undefined&&catalog.sha256!==bindingContract.sha256)throw Error('Binding version/contract');
 if(catalog.catalogRevision!==undefined&&(!Number.isSafeInteger(catalog.catalogRevision)||catalog.catalogRevision<0))throw Error('Data catalog revision');
 const groups=catalog.groups??[];if(!Array.isArray(groups)||groups.length>32)throw Error('Data groups');
 const groupNames=new Set(),parents=new Map(),budget={nodes:0,bytes:0};
 const metadata=(entry,key,max)=>{if(entry[key]!==undefined){bindingText(entry[key],max,'Data '+key,true);budget.bytes+=new TextEncoder().encode(entry[key]).length;}};
 for(const g of groups){only(g,['name','title','description','parent'],'Data group');bindingText(g.name,63,'Data group name');if(groupNames.has(g.name))throw Error('Duplicate data group');groupNames.add(g.name);parents.set(g.name,g.parent??'');for(const [k,m]of [['name',63],['title',128],['description',512],['parent',63]])metadata(g,k,m);}
 for(const g of groups){const seen=new Set([g.name]);let parent=g.parent??'';while(parent){if(!groupNames.has(parent)||seen.has(parent))throw Error('Data group parent/cycle');seen.add(parent);parent=parents.get(parent);}}
 const maximum={groups:32,metadataBytes:32768,schemaNodes:1024,replyBytes:16384};
 if(catalog.catalogLimits!==undefined){only(catalog.catalogLimits,Object.keys(maximum),'Data catalog limits');for(const[k,v]of Object.entries(catalog.catalogLimits))if(!integerRange(v,k==='replyBytes'?512:1,maximum[k]))throw Error('Data catalog limits');}
 for(const [kind,limit] of [['sources',L.sources],['actions',L.actions]]){
  if(!Array.isArray(catalog[kind])||catalog[kind].length>limit)throw Error('Binding '+kind+' limit');
  const names=new Set();for(const entry of catalog[kind]){
   only(entry,kind==='sources'?['name','title','description','group','schema','writable']:['name','title','description','group','schema'],'Binding '+kind+' entry');bindingText(entry.name,63,'Binding name');if(entry.title!==undefined)bindingText(entry.title,128,'Binding title',true);
   if(names.has(entry.name))throw Error('Duplicate binding '+kind+' name');names.add(entry.name);for(const[k,m]of [['name',63],['title',128],['description',512],['group',63]])metadata(entry,k,m);if(entry.group&&!groupNames.has(entry.group))throw Error('Unknown data group');validateDataSchema(entry.schema,0,budget);
   if(kind==='sources'&&entry.writable!==undefined&&typeof entry.writable!=='boolean')throw Error('Source writable');
  }
 }
 if(budget.bytes>(catalog.catalogLimits?.metadataBytes??32768)||budget.nodes>(catalog.catalogLimits?.schemaNodes??1024))throw Error('Data catalog metadata budget');
 if(!Array.isArray(catalog.events)||catalog.events.some(name=>!bindingContract.events.includes(name))||new Set(catalog.events).size!==catalog.events.length)throw Error('Binding events');
 if(catalog.limits!==undefined){only(catalog.limits,Object.keys(L),'Binding limits');for(const [key,value] of Object.entries(catalog.limits))if(!integerRange(value,1,L[key]))throw Error('Binding limit '+key);}
 return catalog;
}
export function dataPathLabel(path=[]){return path.map(p=>typeof p==='number'?'['+p+']':'.'+p).join('');}
