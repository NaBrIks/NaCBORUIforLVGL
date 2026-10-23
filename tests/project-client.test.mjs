import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {decode} from 'cborg';
import {ProjectClient} from '../packages/project-codec/client.js';
import {createProject,encodeProject,decodeProject} from '../packages/project-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
import {offlineCapabilities} from '../packages/screen-codec/index.js';
const fresh=()=>createProject(Array.from({length:14},(_,n)=>createBlankScreen('screen_'+n,'Screen '+n)));
function device({failChunk=false}={}){
 let saved=fresh(),revision='v1',upload=null,saves=0,previews=0,cancels=0,chunks=0;
 const response=(status,value,headers={})=>new Response(value instanceof Uint8Array?value:JSON.stringify(value),{status,headers});
 const client=new ProjectClient('http://device.test:5299',{fetcher:async(url,options)=>{
  const query=new URL(url).searchParams,action=query.get('action');
  if(action==='read')return response(200,encodeProject(saved),{'X-Project-Revision':revision});
  if(action==='begin'){upload={...decode(options.body),data:[]};return response(200,{token:'upload',chunkBytes:2048});}
  if(action==='cancel'){upload=null;cancels++;return response(200,{ok:true});}
  if(action==='chunk'){if(failChunk)return response(500,{error:'write failed'});assert.equal(Number(query.get('offset')),upload.data.length);assert.ok(options.body.length<=2048);upload.data.push(...options.body);chunks++;return response(200,{ok:true});}
  if(action==='finish'){
   assert.equal(upload.data.length,upload.size);const project=decodeProject(new Uint8Array(upload.data));
   if(upload.intent==='save'){if(upload.revision!==revision)return response(409,{error:'conflict'});saved=project;revision='v'+(++saves+1);return response(200,{ok:true,saved:true,revision,persistent:false});}
   previews++;return response(200,{ok:true,saved:false,nodes:1});
  }
  throw Error('Unexpected '+action);
 }});
 return {client,counts:()=>({saves,previews,cancels,chunks}),saved:()=>saved};
}
test('project API client chunks whole projects and keeps preview separate from explicit save',async()=>{
 const {client,counts,saved}=device(),original=await client.read(),draft=fresh();draft.manifest.name='Draft';
 assert.ok(encodeProject(draft).length>4096);await client.preview(draft,draft.manifest.entry);assert.equal(saved().manifest.name,original.project.manifest.name);assert.equal(counts().saves,0);
 const result=await client.save(draft,{revision:original.revision});assert.equal(result.persistent,false);assert.equal(saved().manifest.name,'Draft');assert.equal(counts().previews,1);assert.ok(counts().chunks>4);
 await assert.rejects(client.save(draft,{revision:original.revision}),/409/);assert.equal(counts().saves,1);
});
test('failed project transfer is cancelled and never commits a partial project',async()=>{
 const {client,counts}=device({failChunk:true});await assert.rejects(client.save(fresh(),{revision:'v1'}),/500/);assert.deepEqual(counts(),{saves:0,previews:0,cancels:1,chunks:0});
});

test('explicit save has a separate configurable finish deadline retained by write and transfer',async()=>{
 const storage=device();
 const fetcher=async(url,options)=>{
  if(new URL(url).searchParams.get('action')==='finish')await delay(40,undefined,{signal:options.signal});
  return storage.client.fetcher(url,options);
 };
 const client=new ProjectClient('http://device.test:5299',{fetcher,timeout:10,saveTimeout:200});
 await client.write('screens','screen_0',createBlankScreen('screen_0','Saved slowly'));
 assert.equal(storage.counts().saves,1);assert.equal(storage.saved().screens.screen_0.name,'Saved slowly');
 await assert.rejects(client.preview(fresh(),'screen_0'),{name:'AbortError'});
 assert.equal(storage.counts().previews,0);
 const impatient=new ProjectClient('http://device.test:5299',{fetcher,timeout:200,saveTimeout:5});
 await assert.rejects(impatient.write('screens','screen_0',createBlankScreen('screen_0','Not committed')),{name:'AbortError'});
 assert.equal(storage.counts().saves,1);
});

test('a project transaction keeps its original origin and calls fetch without a receiver',async()=>{
 let origin='http://first.test:5299',calls=0;
 const client=new ProjectClient(()=>origin,{fetcher:async function(url,options){
  assert.equal(this,undefined);assert.equal(new URL(url).origin,'http://first.test:5299');calls++;
  const action=new URL(url).searchParams.get('action');origin='http://second.test:5299';
  return new Response(JSON.stringify(action==='begin'?{token:'t',chunkBytes:2048}:{ok:true,saved:false}));
 }});
 await client.preview(fresh(),'screen_0');assert.ok(calls>3);
});

test('device project limits are enforced before upload and a missing revision is not accepted',async()=>{
 const {client,counts}=device();await assert.rejects(client.preview(fresh(),'screen_0',{capabilities:{...offlineCapabilities(),project:{maxBytes:1}}}),/Project too large/);assert.equal(counts().chunks,0);
 const missing=new ProjectClient('http://device.test:5299',{fetcher:async()=>new Response(encodeProject(fresh()))});await assert.rejects(missing.read(),/revision header missing/);
});
