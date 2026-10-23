import test from 'node:test';
import assert from 'node:assert/strict';
import {decode} from 'cborg';
import {DataClient} from '../packages/project-codec/index.js';
import {bindingContract} from '../packages/screen-codec/index.js';
const capabilities={binding:{version:1,sha256:bindingContract.sha256,events:['clicked'],sources:[
 {name:'app.state',writable:true,schema:{type:'object',fields:{enabled:'bool',values:{type:'array',maxItems:4,items:{type:'integer',min:0,max:10}}}}},
 {name:'app.readonly',schema:'number'}
],actions:[{name:'app.configure',schema:{type:'object',fields:{values:{type:'array',maxItems:4,items:'number'}}}}]}};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
test('data client posts one CBOR command and waits for the actual execution receipt',async()=>{
 let reads=0;const calls=[];
 const client=new DataClient('http://device.test:5299',{pollInterval:1,fetcher:async(url,options)=>{
  calls.push({url,...options});
  return options.method==='POST'?json({queued:true,id:7},202):json({sources:[{name:'app.state',state:'unknown'}],commands:++reads===1?[]:[{id:7,ok:true,error:''}]});
 }});
 const result=await client.invoke('app.configure',{values:[1.5,2]},capabilities);
 assert.equal(result.state,'completed');assert.equal(result.result.ok,true);assert.equal(result.id,7);assert.equal(reads,2);
 const posts=calls.filter(call=>call.method==='POST');assert.equal(posts.length,1);
 assert.equal(posts[0].url,'http://device.test:5299/api/data');assert.equal(posts[0].headers['Content-Type'],'application/cbor');
 assert.deepEqual(decode(posts[0].body),{kind:'action',name:'app.configure',args:{values:[1.5,2]}});
});
test('data commands reuse catalog/schema/path validation and preserve instance-local events',async()=>{
 const commands=[];const client=new DataClient('http://device.test:5299',{fetcher:async(url,options)=>{commands.push(decode(options.body));return json({queued:true,id:commands.length},202);}});
 await client.write('app.state',['values',2],3,capabilities,{wait:false});
 await client.event('nav','clicked',42,capabilities,{wait:false});await client.event('nav','clicked',undefined,capabilities,{wait:false});
 assert.deepEqual(commands,[{kind:'write',source:'app.state',path:['values',2],value:3},{kind:'event',node:'nav',event:'clicked',instance:42},{kind:'event',node:'nav',event:'clicked'}]);
 for(const task of [()=>client.write('app.readonly',[],1,capabilities),()=>client.write('missing',[],1,capabilities),()=>client.write('app.state',['values',4],3,capabilities),()=>client.write('app.state',['values',0],11,capabilities),()=>client.invoke('missing',null,capabilities),()=>client.invoke('app.configure',{values:['bad']},capabilities),()=>client.event('nav','value_changed',1,capabilities),()=>client.event('nav','clicked',0,capabilities),()=>client.event('nav','clicked',0x100000000,capabilities)])await assert.rejects(task);
 assert.equal(commands.length,3,'invalid requests are never submitted');
});
test('rejected receipts are errors; absent receipts never imply success or trigger a retry',async()=>{
 let posts=0;
 const failed=new DataClient('http://device.test:5299',{fetcher:async(url,options)=>options.method==='POST'?(posts++,json({queued:true,id:4},202)):json({commands:[{id:4,ok:false,error:'runtime_inactive'}]})});
 await assert.rejects(failed.command({kind:'event'}),/command 4 rejected: runtime_inactive/);assert.equal(posts,1);
 assert.deepEqual(await failed.receipt(99),{id:99,state:'unknown'});
 const timed=new DataClient('http://device.test:5299',{timeout:2,pollInterval:1,fetcher:async(url,options)=>options.method==='POST'?(posts++,json({queued:true,id:8},202)):json({commands:[]})});
 assert.deepEqual(await timed.command({kind:'action'}),{queued:true,id:8,state:'unconfirmed'});assert.equal(posts,2);
 const lost=new DataClient('http://device.test:5299',{fetcher:async(url,options)=>{if(options.method==='POST'){posts++;return json({queued:true,id:9},202);}throw Error('connection lost');}});
 assert.deepEqual(await lost.command({kind:'action'}),{queued:true,id:9,state:'unconfirmed',error:'connection lost'});assert.equal(posts,3);
});
test('submission failures are not retried; malformed ACKs and oversized snapshots are rejected',async()=>{
 let requests=0;const client=new DataClient('http://device.test:5299',{fetcher:async()=>{requests++;throw Error('timeout');}});
 await assert.rejects(client.command({kind:'action'}),/unconfirmed; do not retry automatically/);assert.equal(requests,1);
 for(const response of [()=>json({queued:true,id:1}),()=>json({queued:true,id:0},202),()=>json(null,202),()=>json({error:'data_queue_full'},503)]){
  const bad=new DataClient('http://device.test:5299',{fetcher:async()=>response()});await assert.rejects(bad.command({kind:'action'}));
 }
 const large=new DataClient('http://device.test:5299',{fetcher:async()=>new Response(' '.repeat(262145))});await assert.rejects(large.read(),/too large/);
});
