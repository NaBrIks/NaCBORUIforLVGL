// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encode} from 'cborg';
import {bindingText,validateBindingCapabilities,validateDataValue,validateDataPath,dataSchemaAtPath} from '../screen-codec/index.js';
import {normalizeDataQuery,readBoundedDataJson,validateDataPage,DataQueryError} from './data-query.js';

// Shared browser/host transport over the existing application-owned DataApi.
// The MCU remains authoritative for actions, setters, events and page lifetimes.
export class DataClient {
 constructor(origin,{fetcher=globalThis.fetch,timeout=6000,pollInterval=100}={}){
  this.origin=typeof origin==='function'?origin:()=>origin;this.fetcher=(...args)=>fetcher(...args);this.timeout=timeout;this.pollInterval=pollInterval;
 }
 async request(method='GET',body){
  const response=await this.fetcher(new URL('/api/data',this.origin()).href,{method,body:body===undefined?undefined:encode(body),headers:body===undefined?{}:{'Content-Type':'application/cbor'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(this.timeout)});
  const text=await response.text();if(text.length>262144)throw Error('Data response too large');
  if(!response.ok)throw Error('Data HTTP '+response.status+': '+text.slice(0,256));
  const value=JSON.parse(text);return {status:response.status,value};
 }
 async read(){return (await this.request()).value;}
 async boundedGet(query,maxBytes){
  const url=new URL('/api/data',this.origin());
  for(const [key,value] of Object.entries(query??{}))url.searchParams.set(key,String(value));
  const response=await this.fetcher(url.href,{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(this.timeout)});
  const value=await readBoundedDataJson(response,maxBytes);
  if(!response.ok)throw new DataQueryError(typeof value?.error==='string'?value.error:'data_http_'+response.status,'Data HTTP '+response.status,{status:response.status,response:value});
  return value;
 }
 async readBounded({maxBytes=4096}={}){return this.boundedGet(null,normalizeDataQuery({maxBytes}).maxBytes);}
 async query(options={}){
  const query=normalizeDataQuery(options);return validateDataPage(await this.boundedGet(query,query.maxBytes),query);
 }
 async receipt(id){
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Data command id');
  const snapshot=await this.read(),result=snapshot.commands?.find(command=>command.id===id);
  return result?{id,state:'completed',result}:{id,state:'unknown'};
 }
 async command(command,{wait=true}={}){
  // Never retry POST: a timeout does not imply that an action was not executed.
  let submitted;
  try{submitted=await this.request('POST',command);}catch(error){
   throw Error('Data command submission failed or unconfirmed; do not retry automatically: '+error.message);
  }
  const {status,value}=submitted;
  if(status!==202||value?.queued!==true||!Number.isSafeInteger(value.id)||value.id<=0)throw Error('Data command submission unconfirmed; invalid receipt; do not retry automatically');
  const accepted={queued:true,id:value.id};if(!wait)return {...accepted,state:'queued'};
  const deadline=Date.now()+this.timeout;
  do{
   let receipt;
   try{receipt=await this.receipt(value.id);}catch(error){return {...accepted,state:'unconfirmed',error:error.message};}
   if(receipt.state==='completed'){
    if(receipt.result.ok!==true)throw Error('Data command '+value.id+' rejected: '+receipt.result.error);
    return {...accepted,...receipt};
   }
   if(Date.now()>=deadline)break;
   await new Promise(resolve=>setTimeout(resolve,Math.min(this.pollInterval,deadline-Date.now())));
  }while(Date.now()<=deadline);
  return {...accepted,state:'unconfirmed'};
 }
 async invoke(name,args,capabilities,options){
  const catalog=validateBindingCapabilities(capabilities);bindingText(name,63,'Action name');
  const action=catalog?.actions.find(action=>action.name===name);if(!action)throw Error('Unknown data action '+name);
  validateDataValue(args,action.schema,{limits:catalog.limits});
  return this.command({kind:'action',name,args},options);
 }
 async write(source,path,value,capabilities,options){
  const catalog=validateBindingCapabilities(capabilities);bindingText(source,63,'Source name');validateDataPath(path);
  const descriptor=catalog?.sources.find(entry=>entry.name===source);if(!descriptor)throw Error('Unknown data source '+source);
  if(descriptor.writable!==true)throw Error('Read-only data source '+source);
  validateDataValue(value,dataSchemaAtPath(descriptor.schema,path),{limits:catalog.limits});
  return this.command({kind:'write',source,path,value},options);
 }
 async event(node,event,instance,capabilities,options){
  const catalog=validateBindingCapabilities(capabilities);bindingText(node,63,'Event node');
  if(!catalog?.events.includes(event))throw Error('Unsupported data event '+event);
  if(instance!==undefined&&(!Number.isInteger(instance)||instance<=0||instance>0xffffffff))throw Error('Event instance');
  return this.command({kind:'event',node,event,...(instance===undefined?{}:{instance})},options);
 }
}
