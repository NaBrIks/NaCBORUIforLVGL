// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encode} from 'cborg';
import {encodeProject,decodeProject,maxProjectBytes} from './index.js';
import {projectDocumentTarget,projectDocumentOutline} from './document-selection.js';

export class ProjectSaveUnconfirmed extends Error {
 constructor(cause,observedRevision){
  super('The target did not confirm the project save.',{cause});
  this.name='ProjectSaveUnconfirmed';
  this.observedRevision=observedRevision;
 }
}

class ProjectHttpError extends Error {}

// Shared browser/MCP transport. No Vue, Node, filesystem or MCP dependency.
export class ProjectClient {
 constructor(origin,{fetcher=globalThis.fetch,timeout=15000,saveTimeout=60000,confirmSave=false}={}){this.origin=typeof origin==='function'?origin:()=>origin;this.fetcher=(...args)=>fetcher(...args);this.timeout=timeout;this.saveTimeout=saveTimeout;this.confirmSave=confirmSave;}
 async request(action,{method='GET',body,query={},signal}={}){
  const url=new URL('/api/project',this.origin());url.searchParams.set('action',action);for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  const response=await this.fetcher(String(url),{method,body,signal:signal??AbortSignal.timeout(this.timeout),cache:'no-store',headers:body?{'Content-Type':'application/cbor'}:{},redirect:'error'});
  if(!response.ok)throw new ProjectHttpError('Project HTTP '+response.status+': '+(await response.text()).slice(0,256));return response;
 }
 async info(){return (await this.request('info')).json();}
 async read(capabilities,{signal}={}){const response=await this.request('read',{signal});const length=Number(response.headers?.get('Content-Length'));if(length>maxProjectBytes)throw Error('Project too large');const revision=response.headers?.get('X-Project-Revision');if(!revision)throw Error('Project revision header missing');return {project:decodeProject(new Uint8Array(await response.arrayBuffer()),capabilities),revision};}
 async transfer(intent,project,{capabilities,revision,screen}={}){
  // Keep one transaction on its original device even if the editor switches connections.
  const client=new ProjectClient(this.origin(),{fetcher:this.fetcher,timeout:this.timeout,saveTimeout:this.saveTimeout,confirmSave:this.confirmSave}),bytes=encodeProject(project,capabilities);
  const start=await (await client.request('begin',{method:'POST',body:encode({intent,size:bytes.length,revision:revision??'',screen:screen??project.manifest.entry})})).json();
  const token=start.token;let completed=false;
  try{
   if(!Number.isInteger(start.chunkBytes)||start.chunkBytes<1||start.chunkBytes>4096)throw Error('Invalid project transfer chunk size');
   for(let offset=0;offset<bytes.length;offset+=start.chunkBytes)await client.request('chunk',{method:'POST',query:{token,offset},body:bytes.subarray(offset,offset+start.chunkBytes)});
   try{
    const result=await (await client.request('finish',{method:'POST',query:{token},body:new Uint8Array(),signal:intent==='save'?AbortSignal.timeout(client.saveTimeout):undefined})).json();
    completed=true;return result;
   }catch(error){
    if(intent!=='save'||!client.confirmSave||error instanceof ProjectHttpError)throw error;
    // The target may have committed before losing the response. Confirm the exact
    // candidate through a bounded read. Never resubmit finish or overwrite a new revision.
    let observedRevision;
    try{
     const saved=await client.read(capabilities,{signal:AbortSignal.timeout(5000)});
     observedRevision=saved.revision;
     const actual=encodeProject(saved.project,capabilities);
     if(saved.revision!==revision&&actual.length===bytes.length&&actual.every((byte,index)=>byte===bytes[index])){
      completed=true;return {saved:true,revision:saved.revision,confirmedByReadback:true};
     }
    }catch{/* A failed read leaves the save unconfirmed. */}
    throw new ProjectSaveUnconfirmed(error,observedRevision);
   }
  }finally{if(!completed)try{await client.request('cancel',{method:'POST',query:{token}});}catch{}}
 }
 save(project,options){return this.transfer('save',project,options);}
 preview(project,screen,options){return this.transfer('preview',project,{...options,screen});}
 async show(screen){return (await this.request('show',{method:'POST',body:encode({screen})})).json();}
 async refresh(){return (await this.request('refresh',{method:'POST',body:encode({})})).json();}
 async reset({kind,name,revision}={}){return (await this.request('reset',{method:'POST',body:encode({kind:kind??'',name:name??'',revision:revision??''})})).json();}
 async readDocument(kind,name,{capabilities,node,outline=false}={}){
  const {project,revision}=await this.read(capabilities),target=projectDocumentTarget(project,kind,name,node);
  if(outline){if(kind!=='screens')throw Error('Outline requires a screen');return {outline:projectDocumentOutline(project.screens[name],node===undefined?undefined:target.document),revision};}
  return {document:target.document,revision,...(node===undefined?{}:{screen:{id:project.screens[name].id,size:project.screens[name].size,styles:project.screens[name].styles??{}}})};
 }
 async write(kind,name,document,{capabilities,revision:expected,node}={}){
  const client=new ProjectClient(this.origin(),{fetcher:this.fetcher,timeout:this.timeout,saveTimeout:this.saveTimeout,confirmSave:this.confirmSave}),{project,revision}=await client.read(capabilities);
  if(expected!==undefined&&expected!==revision)throw Error('project_revision_conflict');
  if(!['screens','styles'].includes(kind))throw Error('Project kind');
  if(node!==undefined){const target=projectDocumentTarget(project,kind,name,node);if(document?.id!==node)throw Error('Replacement node must preserve selected ID');target.container[target.key]=document;}
  else Object.defineProperty(project[kind],name,{value:document,enumerable:true,writable:true,configurable:true});
  return client.save(project,{capabilities,revision});
 }
}
