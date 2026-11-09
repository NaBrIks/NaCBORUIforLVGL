// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {bindingText} from '../screen-codec/index.js';

export const dataQueryKinds=['groups','sources','actions','fields','values'];
const keys=['kind','group','prefix','name','path','descendants','detail','offset','limit','maxBytes','catalogRevision'];
export class DataQueryError extends Error {
 constructor(code,message,{status=400,...details}={}){super(message);this.name='DataQueryError';this.code=code;this.status=status;this.details=details;}
}
const fail=(message)=>{throw new DataQueryError('data_query_invalid',message);};
function integer(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)fail('Invalid '+label);return value;}
export function normalizeDataQuery(options={},defaultKind='groups'){
 if(!options||typeof options!=='object'||Array.isArray(options))fail('Data query must be an object');
 for(const key of Object.keys(options))if(!keys.includes(key))fail('Unknown data query option '+key);
 const query={kind:options.kind??defaultKind};
 if(!dataQueryKinds.includes(query.kind))fail('Invalid data query kind');
 for(const key of ['group','prefix','name'])if(options[key]!==undefined){bindingText(options[key],63,'Data query '+key,key==='prefix');query[key]=options[key];}
 if(options.path!==undefined){
  bindingText(options.path,512,'Data query path',true);
  if(options.path!==''&&!options.path.startsWith('/'))fail('Data query path must be a JSON Pointer');
  const parts=options.path===''?[]:options.path.slice(1).split('/');
  if(parts.length>8)fail('Data query path depth');
  for(const part of parts){
   if(/~(?![01])/u.test(part))fail('Invalid JSON Pointer escape');
   const decoded=part.replace(/~1/g,'/').replace(/~0/g,'~');bindingText(decoded,63,'Data query path segment');
   if(['__proto__','constructor','prototype'].includes(decoded))fail('Unsafe data query path');
  }
  query.path=options.path;
 }
 for(const key of ['descendants','detail']){if(options[key]!==undefined&&typeof options[key]!=='boolean')fail('Invalid '+key);query[key]=options[key]??false;}
 query.offset=integer(options.offset??0,0,Number.MAX_SAFE_INTEGER,'offset');
 query.limit=integer(options.limit??16,1,64,'limit');
 query.maxBytes=integer(options.maxBytes??4096,512,16384,'maxBytes');
 query.catalogRevision=integer(options.catalogRevision??0,0,Number.MAX_SAFE_INTEGER,'catalogRevision');
 return query;
}

// Bounded before JSON parsing: Content-Length is an early rejection, not a trusted bound.
export async function readBoundedDataJson(response,maxBytes){
 const length=response.headers?.get('Content-Length');
 const oversized=()=>new DataQueryError('data_response_too_large','Data response exceeds maxBytes',{status:413,maxBytes});
 if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))throw new DataQueryError('data_response_length','Invalid Data Content-Length',{status:502});
 if(length!==null&&length!==undefined&&Number(length)>maxBytes){await response.body?.cancel?.();throw oversized();}
 const reader=response.body?.getReader?.();
 if(!reader)throw new DataQueryError('data_response_stream','Data response requires bounded streaming',{status:502});
 const chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;
   if(!(value instanceof Uint8Array))throw new DataQueryError('data_response_stream','Invalid Data response chunk',{status:502});
   size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw oversized();}chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw new DataQueryError('data_response_json','Invalid Data JSON response',{status:502});}
}

export function validateDataPage(page,query){
 const safe=value=>Number.isSafeInteger(value)&&value>=0;
 if(!page||page.format!=='lvgl-data-page-1'||!safe(page.catalogRevision)||!safe(page.revision)||!safe(page.total)||
  page.offset!==query.offset||!Array.isArray(page.items)||page.items.length>query.limit||page.offset<page.total&&page.offset+page.items.length>page.total||page.offset>=page.total&&page.items.length!==0||typeof page.hasMore!=='boolean'||
  page.hasMore!==(page.offset+page.items.length<page.total)||
  page.hasMore!==(page.nextOffset!==null)||page.hasMore&&(!safe(page.nextOffset)||page.nextOffset!==page.offset+page.items.length||page.nextOffset<=page.offset||page.nextOffset>page.total))
  throw new DataQueryError('data_response_page','Invalid Data page envelope',{status:502});
 if(query.catalogRevision!==0&&query.catalogRevision!==page.catalogRevision)throw new DataQueryError('data_catalog_revision','Data catalog revision changed',{status:409,catalogRevision:page.catalogRevision});
 return page;
}
