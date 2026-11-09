// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {DataClient} from '../packages/project-codec/index.js';
import {normalizeDataQuery,DataQueryError} from '../packages/project-codec/data-query.js';
const page=(overrides={})=>({format:'lvgl-data-page-1',catalogRevision:7,revision:12,total:1,offset:0,nextOffset:null,hasMore:false,items:[{name:'app.speed',type:'number'}],...overrides});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('data query validates bounded selectors and JSON Pointer before any request',async()=>{
 assert.deepEqual(normalizeDataQuery(),{kind:'groups',descendants:false,detail:false,offset:0,limit:16,maxBytes:4096,catalogRevision:0});
 assert.equal(normalizeDataQuery({kind:'fields',name:'app.sensors',path:'/axle~1left/t~0',group:'vehicle',prefix:'app.'}).path,'/axle~1left/t~0');
 let requests=0;const client=new DataClient('http://device.test:5299',{fetcher:async()=>{requests++;return response(page());}});
 for(const options of [null,[],{unknown:true},{kind:'anything'},{limit:0},{limit:65},{offset:-1},{offset:1.1},{maxBytes:511},{maxBytes:16385},{catalogRevision:-1},{catalogRevision:2**53},{detail:1},{descendants:'false'},{group:''},{name:''},{path:'not/a/pointer'},{path:'/bad~2escape'},{path:'/constructor'},{path:'/a//b'},{path:'/a/b/c/d/e/f/g/h/i'},{prefix:'\ud800'}]){
  await assert.rejects(client.query(options));
 }
 assert.equal(requests,0);
});

test('selective queries send paging and revision to the API without fetching a legacy snapshot',async()=>{
 const calls=[];const client=new DataClient('http://device.test:5299',{fetcher:async(url,options)=>{
  calls.push({url:new URL(url),options});const q=new URL(url).searchParams;
  assert.equal(q.get('kind'),'sources');assert.equal(q.get('group'),'vehicle');assert.equal(q.get('prefix'),'app.');
  return response(page({total:2,offset:Number(q.get('offset')),nextOffset:q.get('offset')==='0'?1:null,hasMore:q.get('offset')==='0'}));
 }});
 const first=await client.query({kind:'sources',group:'vehicle',prefix:'app.',limit:1,maxBytes:1024});
 assert.equal(first.nextOffset,1);assert.equal(first.hasMore,true);
 await client.query({kind:'sources',group:'vehicle',prefix:'app.',offset:first.nextOffset,catalogRevision:first.catalogRevision,limit:1,maxBytes:1024});
 assert.equal(calls.length,2);assert.equal(calls[1].url.searchParams.get('catalogRevision'),'7');
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');
});

test('JSON Pointer branch and explicit full detail reach the shared endpoint unchanged',async()=>{
 let captured;const nested={name:'sensors',schema:{type:'array',maxItems:8,items:{type:'object',fields:{value:'number'}}}};
 const client=new DataClient('http://device.test:5299',{fetcher:async url=>{captured=new URL(url).searchParams;return response(page({items:[nested]}));}});
 const result=await client.query({kind:'fields',name:'app.state',path:'/sensors',detail:true,descendants:true});
 assert.equal(captured.get('path'),'/sensors');assert.equal(captured.get('detail'),'true');assert.equal(captured.get('descendants'),'true');
 assert.deepEqual(result.items[0],nested);
});

test('bounded transport rejects advertised size before reading and counts stream UTF-8 bytes',async()=>{
 let consumed=0,cancelled=0;
 const large=new DataClient('http://device.test:5299',{fetcher:async()=>({ok:true,status:200,headers:new Headers({'Content-Length':'9999999'}),body:{cancel:async()=>{cancelled++;},getReader(){consumed++;throw Error('must not read');}}})});
 await assert.rejects(large.query({maxBytes:512}),error=>error instanceof DataQueryError&&error.code==='data_response_too_large'&&error.status===413);
 assert.equal(consumed,0);assert.equal(cancelled,1);
 const bytes=new TextEncoder().encode(JSON.stringify(page({items:[{description:'я'.repeat(400)}]})));
 const streamed=new DataClient('http://device.test:5299',{fetcher:async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(bytes);},cancel(){cancelled++;}}))});
 await assert.rejects(streamed.query({maxBytes:512}),/exceeds maxBytes/);assert.equal(cancelled,2);
 let textCalled=false;
 const unbounded=new DataClient('http://device.test:5299',{fetcher:async()=>({ok:true,status:200,headers:new Headers(),text:async()=>{textCalled=true;return ' '.repeat(100000);}})});
 await assert.rejects(unbounded.query(),/bounded streaming/);assert.equal(textCalled,false);
});

test('catalog conflicts and oversized records remain explicit errors without retry/fallback',async()=>{
 for(const [status,error] of [[409,'data_catalog_revision'],[413,'data_query_record_limit'],[400,'data_query_invalid']]){
  let requests=0;const client=new DataClient('http://device.test:5299',{fetcher:async()=>{requests++;return response({error,catalogRevision:9},status);}});
  await assert.rejects(client.query({kind:'sources',catalogRevision:7}),e=>e instanceof DataQueryError&&e.status===status&&e.code===error&&e.details.response.catalogRevision===9);
  assert.equal(requests,1);
 }
 const stale=new DataClient('http://device.test:5299',{fetcher:async()=>response(page({catalogRevision:8}))});
 await assert.rejects(stale.query({catalogRevision:7}),e=>e.status===409);
});

test('explicit bounded legacy snapshots preserve bare GET while ordinary UI read stays compatible',async()=>{
 const calls=[],snapshot={sources:[{name:'app.speed',state:'known',value:12}],commands:[{id:3,ok:true}]};
 const client=new DataClient('http://device.test:5299',{fetcher:async url=>{calls.push(url);return response(snapshot);}});
 assert.deepEqual(await client.readBounded({maxBytes:512}),snapshot);assert.equal(new URL(calls[0]).search,'');
 assert.deepEqual(await client.read(),snapshot);assert.equal(new URL(calls[1]).search,'');
 const large=new DataClient('http://device.test:5299',{fetcher:async()=>response({sources:['x'.repeat(2000)]})});
 await assert.rejects(large.readBounded({maxBytes:512}),e=>e.status===413&&e.code==='data_response_too_large');
});

test('malformed pages and malformed JSON are not accepted as a successful catalog',async()=>{
 for(const value of [page({format:'other'}),page({catalogRevision:-1}),page({revision:2**53}),page({offset:1}),page({items:{}}),page({hasMore:true,nextOffset:0}),page({hasMore:false,nextOffset:2})]){
  const client=new DataClient('http://device.test:5299',{fetcher:async()=>response(value)});await assert.rejects(client.query(),e=>e.code==='data_response_page');
 }
 const invalid=new DataClient('http://device.test:5299',{fetcher:async()=>new Response('{invalid')});await assert.rejects(invalid.query(),e=>e.code==='data_response_json');
});
