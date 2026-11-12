// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encode,decode} from 'cborg';
import {createBrowserTools} from '../tools/designer/browser-tools/tools.js';
import {nativeFetcher,bytesToBase64,base64ToBytes} from '../tools/designer/browser-tools/http.js';
import {inspectBmp,frameLimits} from '../tools/designer/browser-tools/frame.js';
import {offlineCapabilities,screenContract} from '../packages/screen-codec/index.js';
import {contract} from '../packages/style-codec/index.js';
import {createProject,encodeProject,decodeProject} from '../packages/project-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const unwrap=value=>JSON.parse(value.content.find(item=>item.type==='text').text);
function fixture({intercept,afterSave,getPreviewFrame,frameEncoder}={}){
 const capabilities=structuredClone(offlineCapabilities());capabilities.source='device';
 capabilities.binding.sources=[{name:'level',writable:true,schema:{type:'integer',min:0,max:100}},{name:'readonly',writable:false,schema:{type:'text',maxBytes:32}}];
 capabilities.binding.actions=[{name:'add',schema:{type:'integer',min:1,max:10}}];
 const device={source:'device',boot_id:'fixture-1',native_view:false,contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256};
 let saved=createProject([createBlankScreen('main','Main')]),revision='v1',display={screen:'main',revision:'v1'},transfer,receipt;
 const calls=[];
 const fetcher=async(input,options={})=>{
  const url=new URL(input);calls.push({url,options});if(intercept){const response=await intercept({url,options});if(response)return response;}
  if(url.pathname==='/api/info')return json(device);
  if(url.pathname==='/api/capabilities')return json(capabilities);
  if(url.pathname==='/api/project'){
   const action=url.searchParams.get('action');
   if(action==='info')return json({project:{entry:saved.manifest.entry,revision},display});
   if(action==='read')return new Response(encodeProject(saved,capabilities),{headers:{'X-Project-Revision':revision,'Content-Type':'application/cbor'}});
   if(action==='begin'){transfer={...decode(options.body),chunks:[]};if(transfer.intent==='save'&&transfer.revision!==revision)return json({error:'project_revision_conflict'},409);return json({token:'transfer',chunkBytes:512});}
   if(action==='chunk'){transfer.chunks.push(new Uint8Array(options.body));return json({accepted:true});}
   if(action==='finish'){
    const bytes=new Uint8Array(transfer.chunks.reduce((sum,part)=>sum+part.length,0));let at=0;for(const part of transfer.chunks){bytes.set(part,at);at+=part.length;}
    const next=decodeProject(bytes,capabilities);if(transfer.intent==='save'){saved=next;revision='v'+(Number(revision.slice(1))+1);await afterSave?.();return json({saved:true,revision});}
    display={screen:transfer.screen,revision:'preview'};return json({preview:true,nodes:1});
   }
   if(action==='refresh'){display={...display,revision};return json({refreshed:true});}
   if(action==='show'){display={screen:decode(options.body).screen,revision};return json({shown:true});}
   if(action==='cancel')return json({cancelled:true});
  }
  if(url.pathname==='/api/data'){
   if(options.method==='POST'){const command=decode(options.body);receipt={id:1,ok:true,error:'',command};return json({queued:true,id:1},202);}
   if(url.searchParams.has('kind'))return json({format:'lvgl-data-page-1',catalogRevision:1,revision:1,total:1,offset:0,nextOffset:null,hasMore:false,items:[{name:'level',value:42}]});
   return json({sources:[],commands:receipt?[receipt]:[],diagnostics:{bindingErrors:0}});
  }
  throw Error('Unexpected fixture URL '+input);
 };
 const tools=createBrowserTools({origin:'http://target.test:5299',fetcher,getPreviewFrame,frameEncoder,references:{screen:'## overview\nScreen guide\n## bindings-events\nRules',style:'## overview\nStyle guide'},example:createBlankScreen('example','Example')});
 return {tools,calls,capabilities,device,get saved(){return saved;},get display(){return display;},get revision(){return revision;}};
}

test('local tools discover real capabilities and use shared authoring validation without a listener',async()=>{
 const state=fixture(),connected=await state.tools.connect();
 assert.ok(connected.tools.length>=20);assert.equal(new Set(connected.tools.map(tool=>tool.name)).size,connected.tools.length);
 assert.equal(connected.capabilities.source,'device');assert.equal(connected.device.boot_id,'fixture-1');
 const fullGuide=['system-prompt','layout-reference','styles-reference'].map(file=>readFileSync(new URL('../tools/designer/prompts/assistant-'+file+'.md',import.meta.url),'utf8')).join('\n\n');
 const guideReply=JSON.stringify([{type:'text',text:fullGuide+'\n\n'+connected.instructions}]);
 assert.ok(Buffer.byteLength(guideReply)<=65535-512,'complete authoring guide fits the Windows MCP reply buffer');
 assert.equal(connected.tools.find(tool=>tool.name==='save_project').annotations.destructiveHint,true);
 assert.ok(state.calls.every(call=>(call.options.method??'GET')==='GET'),'connect is passive');
 assert.deepEqual(unwrap(await state.tools.call('get_ui_reference',{kind:'screen',topic:'index'})).topics,['overview','bindings-events']);
 assert.equal(unwrap(await state.tools.call('validate_document',{kind:'project',document:state.saved})).valid,true);
 assert.equal((await state.tools.call('validate_document',{kind:'project',document:JSON.stringify(state.saved)})).isError,true);
 assert.equal((await state.tools.call('get_device',{section:'all'})).isError,true);
 const source=unwrap(await state.tools.call('get_data_catalog',{kind:'sources',limit:4}));assert.equal(source.items[0].name,'level');
 assert.equal((await state.tools.call('get_device',{url:'http://foreign.test'})).isError,true);
});

test('MCP returns cached preview data without touching the target and forwards the wait criteria',async()=>{
 let args;
 const state=fixture({getPreviewFrame:(options,signal)=>{
  signal.throwIfAborted();args=options;
  return Promise.resolve({data:'AA==',mimeType:'image/png',source:'preview',scene:8,frameRevision:'91'});
 }});
 const reply=await state.tools.call('get_display_frame',{fresh:true,afterScene:7,maxEdge:256});
 assert.deepEqual(args,{fresh:true,afterScene:7,maxEdge:256});
 assert.deepEqual(unwrap(reply),{source:'preview',scene:8,frameRevision:'91'});
 assert.equal(reply.content[1].data,'AA==');
 assert.deepEqual(state.calls,[]);
});

test('MCP captures on the device only when preview is absent and preserves its scene header',async()=>{
 const state=fixture({frameEncoder:async()=>({data:'AA==',mimeType:'image/png'}),intercept:({url})=>{
  if(url.pathname==='/api/info')return json({native_view:true});
  if(url.pathname==='/api/view/frame')return new Response(Uint8Array.of(1),{headers:{'Content-Type':'image/bmp','X-Frame-Scene':'18','X-Frame-Revision':'80'}});
 }});
 const reply=await state.tools.call('get_display_frame',{afterScene:17});
 const metadata=unwrap(reply);
 assert.equal(metadata.source,'device');assert.equal(metadata.scene,18);assert.equal(metadata.frameRevision,'80');
 assert.equal(state.calls.filter(({url})=>url.pathname==='/api/view/frame').length,1);
 const old=await state.tools.call('get_display_frame',{afterScene:18});
 assert.equal(old.isError,true);assert.match(old.content[0].text,/display_scene_not_advanced/);
});

test('instrument appearance guides survive device discovery with the default response budget',async()=>{
 const {tools,capabilities,calls}=fixture();
 const instruments=JSON.parse(readFileSync(new URL('../examples/s3_style_lab/main/native_widgets/catalog.json',import.meta.url),'utf8'));
 capabilities.extensions=instruments.map(({id,name,abi,contract})=>({id,name,abi,contract}));
 capabilities.availableWidgets.push(...instruments.map(({id})=>id));
 const lastWidgets=unwrap(await tools.call('get_device',{section:'widgets',offset:capabilities.availableWidgets.length-instruments.length}));
 assert.deepEqual(lastWidgets.items.map(({name,hasAppearance})=>[name,hasAppearance]),instruments.map(({name})=>[name,true]));
 for(const {name,contract:{appearance}} of instruments){
  const response=await tools.call('get_device',{section:'widgets',name});
  assert.ok(!response.isError,response.content[0].text);
  const [widget]=unwrap(response).items;
  assert.deepEqual(widget.appearance,appearance);
  assert.ok(widget.methods.length);
 }
 assert.ok(calls.every(call=>(call.options.method??'GET')==='GET'));
});

test('project save/preview/refresh keep existing codec, revision and display semantics',async()=>{
 const state=fixture();await state.tools.connect();const before=structuredClone(state.saved),next=structuredClone(state.saved);next.screens.main.name='New authored label';
 const preview=unwrap(await state.tools.call('preview_project',{project:next,screen:'main'}));assert.equal(preview.preview,true);assert.deepEqual(state.saved,before);
 const save=unwrap(await state.tools.call('save_project',{project:next,revision:'v1'}));assert.equal(save.saved,true);assert.equal(save.displayUpdatedBySave,false);assert.equal(state.display.revision,'preview');
 assert.equal(state.saved.screens.main.name,'New authored label');
 assert.equal((await state.tools.call('save_project',{project:next,revision:'v1'})).isError,true,'conflict is not silently retried');
 const posts=state.calls.filter(call=>call.url.searchParams.get('action')==='begin');assert.equal(posts.length,3,'one preview and two explicit save attempts');
 await state.tools.call('refresh_project_display',{});assert.equal(state.display.revision,state.revision);
 state.tools.dispose();assert.equal((await state.tools.call('read_project',{})).isError,true);
});

test('application schema controls runtime calls and real execution receipts',async()=>{
 const state=fixture();await state.tools.connect();
 const readonly=await state.tools.call('write_source',{source:'readonly',value:'forbidden'});assert.equal(readonly.isError,true);
 assert.equal(state.calls.filter(call=>call.options.method==='POST').length,0);
 assert.equal((await state.tools.call('invoke_action',{name:'add',args:11})).isError,true);
 const written=unwrap(await state.tools.call('write_source',{source:'level',value:45}));assert.equal(written.state,'completed');assert.equal(written.result.ok,true);
 const post=state.calls.find(call=>call.options.method==='POST');assert.equal(post.options.headers['Content-Type'],'application/cbor');assert.deepEqual(decode(post.options.body),{kind:'write',source:'level',path:[],value:45});
 const action=unwrap(await state.tools.call('invoke_action',{name:'add',args:2,wait:false}));assert.equal(action.state,'queued');
});

test('native HTTP byte adapter preserves CBOR/headers and refuses another origin',async()=>{
 let request;const fetcher=nativeFetcher('http://target.test:5299',async value=>{request=value;return {status:200,headers:{'Content-Type':'application/cbor','X-Project-Revision':'v7'},body:bytesToBase64(Uint8Array.of(0,128,255))};});
 const response=await fetcher('http://target.test:5299/api/project?action=chunk',{method:'POST',body:Uint8Array.of(0xa1,0x01,0xff),headers:{'Content-Type':'application/cbor'}});
 assert.deepEqual(base64ToBytes(request.body),Uint8Array.of(0xa1,0x01,0xff));assert.equal(request.method,'POST');assert.equal(response.headers.get('X-Project-Revision'),'v7');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),Uint8Array.of(0,128,255));
 await assert.rejects(fetcher('http://foreign.test/api/info'),/origin mismatch/);
 assert.throws(()=>base64ToBytes('AAAA',2),/limit/);
 const abort=new AbortController();abort.abort();await assert.rejects(fetcher('http://target.test:5299/api/info',{signal:abort.signal}));
});

test('browser frame preflight bounds native dimensions and BMP memory before canvas decoding',()=>{
 const bytes=new Uint8Array(54+320*240*4),view=new DataView(bytes.buffer);bytes[0]=0x42;bytes[1]=0x4d;view.setUint32(2,bytes.length,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,320,true);view.setInt32(22,-240,true);view.setUint16(26,1,true);view.setUint16(28,32,true);
 assert.deepEqual(inspectBmp(bytes),{width:320,height:240});
 view.setInt32(18,frameLimits.pixels,true);assert.throws(()=>inspectBmp(bytes),/frame_bmp_format/);
 assert.throws(()=>inspectBmp(new Uint8Array(4)),/frame_input_size_limit/);
});


test('disconnect stops subsequent transfer requests and never reports a known committed save as failed',async()=>{
 let release,started;const began=new Promise(done=>started=done),blocked=new Promise(done=>release=done);
 const first=fixture({intercept:async({url})=>{if(url.searchParams.get('action')==='chunk'){started();await blocked;}}});await first.tools.connect();
 const saving=first.tools.call('save_project',{project:first.saved,revision:'v1'});await began;first.tools.dispose();release();
 const stopped=await saving;assert.equal(stopped.isError,true);assert.equal(unwrap({...stopped,isError:false}).state,'unconfirmed');
 assert.equal(first.calls.filter(call=>call.url.searchParams.get('action')==='finish').length,0,'disposed scope cannot issue a later finish/save');
 let finish,finishStarted;const reached=new Promise(done=>finishStarted=done),commit=new Promise(done=>finish=done);
 const second=fixture({intercept:async({url})=>{if(url.searchParams.get('action')==='finish'){finishStarted();return commit;}}});await second.tools.connect();
 const known=second.tools.call('save_project',{project:second.saved,revision:'v1'});await reached;second.tools.dispose();finish(json({saved:true,persistent:true,revision:'v2'}));
 const saved=await known;assert.notEqual(saved.isError,true);const ack=unwrap(saved);assert.equal(ack.saved,true);assert.equal(ack.revision,'v2');assert.equal(ack.connectionClosed,true);assert.equal(ack.displayStatusKnown,false);
});

test('byte transport cancels native HTTP by request id and carries the extended save budget',async()=>{
 let request,started;const began=new Promise(done=>started=done),cancelled=[];
 const send=Object.assign(async value=>{request=value;started();return new Promise(()=>{});},{cancel:id=>cancelled.push(id)}),fetcher=nativeFetcher('http://target.test:5299',send),stop=new AbortController();
 const pending=fetcher('http://target.test:5299/api/project?action=finish',{method:'POST',body:new Uint8Array(),signal:stop.signal,timeoutMs:65000});await began;stop.abort();await assert.rejects(pending);assert.equal(request.timeoutMs,65000);assert.ok(request.id);assert.deepEqual(cancelled,[request.id]);
});

test('streaming native HTTP pulls bounded chunks and forwards frame metadata',async()=>{
 const bytes=Uint8Array.from({length:20000},(_,index)=>index%251),calls=[],cancelled=[];let offset=0;
 const send=Object.assign(async()=>{throw Error('buffered path must not be used');},{
  begin:async request=>{calls.push(['begin',request]);return {status:200,headers:{'Content-Type':'application/x-lvgl-frame','Content-Length':String(bytes.length),'X-Frame-Revision':'42'},streamId:request.id};},
  read:async(id,maxBytes)=>{assert.equal(id,calls[0][1].id);assert.ok(maxBytes<=16384);calls.push(['read',maxBytes]);if(offset===bytes.length)return {done:true,body:''};const chunk=bytes.slice(offset,offset+maxBytes);offset+=chunk.length;return {done:false,body:bytesToBase64(chunk)};},
  cancel:id=>cancelled.push(id)
 });
 const response=await nativeFetcher('http://target.test:5299',send)('http://target.test:5299/api/view/frame?packets=1',{stream:true,headers:{Accept:'application/x-lvgl-frame'}});
 assert.equal(response.headers.get('X-Frame-Revision'),'42');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 assert.equal(calls[0][0],'begin');assert.ok(calls.filter(call=>call[0]==='read').length>=2);assert.deepEqual(cancelled,[]);
});

test('aborting a streamed native HTTP body cancels its active C# request id',async()=>{
 let request,readStarted;const started=new Promise(resolve=>readStarted=resolve),cancelled=[];
 const send=Object.assign(async()=>{}, {
  begin:async value=>{request=value;return {status:200,headers:{'Content-Type':'application/x-lvgl-frame'},streamId:value.id};},
  read:async()=>{readStarted();return new Promise(()=>{});},
  cancel:id=>cancelled.push(id)
 });
 const stop=new AbortController(),response=await nativeFetcher('http://target.test:5299',send)('http://target.test:5299/api/view/frame',{stream:true,signal:stop.signal});
 const pending=response.body.getReader().read();await started;stop.abort(Error('Stop stream'));
 await assert.rejects(pending);assert.deepEqual(cancelled,[request.id]);
});


test('cancelling one concurrent call aborts its HTTP and leaves the connection and another call usable',async()=>{
 let release,entered;const start=new Promise(done=>entered=done),blocked=new Promise(done=>release=done);
 const state=fixture({intercept:async({url,options})=>{if(url.searchParams.get('action')==='chunk'){entered();await blocked;options.signal.throwIfAborted();}}});await state.tools.connect();
 const saving=state.tools.call('save_project',{project:state.saved,revision:'v1'},'cancel-this');await start;
 const independent=state.tools.call('get_project_status',{},'keep-this');state.tools.cancelCall('cancel-this');release();
 const cancelled=await saving;assert.equal(cancelled.isError,true);assert.equal(unwrap({...cancelled,isError:false}).state,'unconfirmed');
 assert.equal(unwrap(await independent).project.revision,'v1');assert.equal(state.calls.filter(call=>call.url.searchParams.get('action')==='finish').length,0);
 assert.equal(unwrap(await state.tools.call('get_project_status',{},'after-stop')).project.revision,'v1','Stop does not require reconnect');
 state.tools.cancelCall('not-started');const posted=state.calls.length;assert.equal((await state.tools.call('save_project',{project:state.saved,revision:'v1'},'not-started')).isError,true);assert.equal(state.calls.length,posted,'a queued cancelled invocation issues no requests');
});


test('pointer tool is capability-gated, sends only CBOR once and does not wait for a frame',async()=>{
 const state=fixture({intercept:async({url,options})=>url.pathname==='/api/view/input'?json({ok:true,queued:true},202):undefined});
 let connected=await state.tools.connect();assert.ok(!connected.tools.some(tool=>tool.name==='send_view_input'));
 assert.equal((await state.tools.call('send_view_input',{x:1,y:2,pressed:true})).isError,true);
 assert.equal(state.calls.filter(call=>call.url.pathname==='/api/view/input').length,0);
 state.device.native_view_input=true;connected=await state.tools.connect();const tool=connected.tools.find(tool=>tool.name==='send_view_input');assert.ok(tool);assert.equal(tool.annotations.readOnlyHint,false);assert.equal(tool.annotations.idempotentHint,false);
 const before=state.calls.length;assert.deepEqual(unwrap(await state.tools.call('send_view_input',{x:799,y:479,pressed:true})),{ok:true,queued:true});
 const calls=state.calls.slice(before);assert.equal(calls.length,1);const sent=calls[0];assert.equal(sent.url.pathname,'/api/view/input');assert.equal(sent.options.timeoutMs,2000);assert.equal(sent.options.headers['Content-Type'],'application/cbor');assert.deepEqual(decode(sent.options.body),{x:799,y:479,pressed:true});
 assert.equal((await state.tools.call('send_view_input',{x:-1,y:2,pressed:true})).isError,true);assert.equal((await state.tools.call('send_view_input',{x:1,y:2,pressed:'yes'})).isError,true);
 const denied=fixture({intercept:async({url})=>url.pathname==='/api/view/input'?json({error:'pointer_queue_full'},429):undefined});denied.device.native_view_input=true;await denied.tools.connect();const response=await denied.tools.call('send_view_input',{x:1,y:2,pressed:true});assert.equal(response.isError,true);assert.match(response.content[0].text,/pointer_queue_full/);assert.equal(denied.calls.filter(call=>call.url.pathname==='/api/view/input').length,1,'unconfirmed presses are never retried');
});
test('pointer tool cancellation reaches the existing native HTTP cancellation boundary',async()=>{
 const state=fixture();state.device.native_view_input=true;await state.tools.connect();let started;const began=new Promise(done=>started=done);
 const cancelled=[];const send=Object.assign(async request=>{started();return new Promise(()=>{});},{cancel:id=>cancelled.push(id)});
 const forward=nativeFetcher('http://target.test:5299',send);
 const tools=createBrowserTools({origin:'http://target.test:5299',fetcher:(input,options)=>new URL(input).pathname==='/api/view/input'?forward(input,options):stateFetch(input,options)});
 async function stateFetch(input,options){if(new URL(input).pathname==='/api/info')return json(state.device);return json(state.capabilities);}
 await tools.connect();const pending=tools.call('send_view_input',{x:3,y:4,pressed:true},'pointer-cancel');await began;tools.cancelCall('pointer-cancel');const response=await pending;assert.equal(response.isError,true);assert.equal(JSON.parse(response.content[0].text).state,'unconfirmed');assert.equal(cancelled.length,1);tools.dispose();
});

test('unknown receipts explain uncertainty; reboot invalidates even a reused completed ID',async()=>{
 const state=fixture();await state.tools.connect();
 const unknown=unwrap(await state.tools.call('get_data_command',{id:99}));
 assert.equal(unknown.state,'unknown');assert.match(unknown.note,/Do not poll indefinitely/);
 await state.tools.call('invoke_action',{name:'add',args:1});
 state.device.boot_id='fixture-2';
 const restarted=unwrap(await state.tools.call('get_data_command',{id:1}));
 assert.equal(restarted.state,'interrupted');assert.equal(restarted.deviceRestarted,true);
 assert.match(restarted.note,/Stop polling/);
 assert.equal(state.calls.filter(x=>x.options.method==='POST').length,1,'receipt recovery never replays a mutation');
});

test('lost save reply is confirmed by an exact project read without another POST',async()=>{
 const state=fixture({afterSave:()=>{throw TypeError('The response ended prematurely.');}});
 await state.tools.connect();
 const project=structuredClone(state.saved);
 project.screens.main.name='Saved before lost reply';
 const outcome=await state.tools.call('save_project',{project,revision:'v1',refresh:true});
 assert.notEqual(outcome.isError,true);
 assert.equal(unwrap(outcome).confirmedByReadback,true);
 assert.equal(unwrap(outcome).displayRevisionMatchesSaved,true);
 assert.equal(state.calls.filter(c=>c.url.searchParams.get('action')==='finish').length,1);
 assert.equal(state.calls.filter(c=>c.url.searchParams.get('action')==='cancel').length,0);
});

test('lost save without a matching project reports unconfirmed and never retries finish',async()=>{
 const state=fixture({intercept:({url})=>{
  if(url.searchParams.get('action')==='finish')throw TypeError('The response ended prematurely.');
 }});
 await state.tools.connect();
 const project=structuredClone(state.saved);
 project.screens.main.name='Unconfirmed change';
 const outcome=await state.tools.call('save_project',{project,revision:'v1',refresh:true});
 assert.equal(outcome.isError,true);
 assert.equal(unwrap(outcome).state,'unconfirmed');
 assert.equal(unwrap(outcome).observedRevision,'v1');
 assert.equal(state.calls.filter(c=>c.url.searchParams.get('action')==='finish').length,1);
 assert.equal(state.calls.filter(c=>c.url.searchParams.get('action')==='refresh').length,0);
});
