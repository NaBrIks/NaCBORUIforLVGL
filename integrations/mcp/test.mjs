// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createScreen} from '../../frontend/src/screen-model.js';
import {DeviceClient} from './device.js';
import {contract,decodePacket} from '../../packages/style-codec/index.js';
import {screenContract,offlineCapabilities,bindingContract} from '../../packages/screen-codec/index.js';
import {createProject,encodeProject,decodeProject} from '../../packages/project-codec/index.js';
import {createBlankScreen} from '../../frontend/src/screen-model.js';
import {createServer as createMcpServer} from './server.js';
import {decode} from 'cborg';
import {encode} from 'cborg';
import {spawnSync} from 'node:child_process';

function memoryPair(){
 let closed=false;const pair=[{},{}];
 for(let i=0;i<2;i++)Object.assign(pair[i],{start:async()=>{},send:async message=>{if(closed)throw Error('Transport closed');queueMicrotask(()=>pair[1-i].onmessage?.(structuredClone(message)));},close:async()=>{if(closed)return;closed=true;for(const peer of pair)peer.onclose?.();}});
 return pair;
}
// Pure injected fetch responses: no sockets or HTTP listener in unit tests.
function fetchFixture(handler){return async(input,options={})=>{
 let result;const bytes=Buffer.from(options.body??[]),request={url:String(input),method:options.method??'GET',headers:Object.fromEntries(new Headers(options.headers??{}).entries()),async *[Symbol.asyncIterator](){if(bytes.length)yield bytes;}};
 const response={status:200,headers:{},writeHead(status,headers){this.status=status;this.headers=headers;},end(body){result=new Response(body,{status:this.status,headers:this.headers});}};
 await handler(request,response);if(!result)throw Error('Fixture response missing');return result;
};}
async function connect(t,env={},fetcher){
 if(fetcher){
  const client=new Client({name:'lvgl-cbor-memory-test',version:'1'}),server=createMcpServer({device:env.LVGL_CBOR_DEVICE,allowPreview:env.LVGL_CBOR_ALLOW_PREVIEW==='1',allowSave:env.LVGL_CBOR_ALLOW_SAVE==='1',allowData:env.LVGL_CBOR_ALLOW_DATA==='1',fetcher});
  const [clientTransport,serverTransport]=memoryPair();await server.connect(serverTransport);await client.connect(clientTransport);t.after(async()=>{await client.close();await server.close();});return client;
 }
 const client=new Client({name:'lvgl-cbor-test',version:'0.1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./index.js',import.meta.url))],env:{PATH:process.env.PATH,...env},stderr:'pipe'});
 await client.connect(transport);t.after(()=>client.close());return client;
}
const data=result=>{assert.equal(result.isError,undefined,JSON.stringify(result.content));return JSON.parse(result.content[0].text);};
test('real stdio exposes authoring documentation, JSON validation and CSS without codec internals',async t=>{
 const client=await connect(t),tools=(await client.listTools()).tools.map(t=>t.name);
 assert.deepEqual(tools.sort(),['get_ui_reference','validate_document','convert_css','get_example'].sort());
 const example=data(await client.callTool({name:'get_example',arguments:{kind:'screen'}}));assert.equal(example.format,'lvgl-screen-draft-1');assert.equal(example.root.children.length,4);
 const valid=data(await client.callTool({name:'validate_document',arguments:{kind:'screen',document:example}}));assert.equal(valid.valid,true);assert.equal(valid.checkedAgainst,'authoring-format');assert.equal(valid.cborBase64,undefined);
 const reference=data(await client.callTool({name:'get_ui_reference',arguments:{kind:'screen',topic:'bindings-events'}}));assert.match(reference.markdown,/get_data_catalog/);
 const aliases=data(await client.callTool({name:'get_ui_reference',arguments:{kind:'style',topic:'layout'}}));assert.match(aliases.markdown,/LV_LAYOUT_FLEX/);assert.doesNotMatch(aliases.markdown,/opcode|signature/i);
 const index=data(await client.callTool({name:'get_ui_reference',arguments:{kind:'style',topic:'index'}}));assert.ok(index.topics.includes('enumerations'));
 const css=data(await client.callTool({name:'convert_css',arguments:{kind:'screen',document:createScreen(),direction:'import',css:'#root{padding:12px;}'}}));assert.equal(css.ok,true);
 assert.equal((await client.callTool({name:'validate_document',arguments:{kind:'screen',document:{}}})).isError,true);
 for(const removed of ['get_contract','compile_document','decode_document'])await assert.rejects(client.callTool({name:removed,arguments:{}}),/not found/);
});
test('device writes and CSS tools can be excluded entirely from registration',async t=>{
 const client=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:5298',LVGL_CBOR_MCP_CSS:'0'}),tools=(await client.listTools()).tools.map(t=>t.name);
 assert.ok(tools.includes('get_device'));assert.ok(!tools.includes('apply_document'));assert.ok(!tools.includes('convert_css'));
 const enabled=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:5298',LVGL_CBOR_ALLOW_APPLY:'1'});
 const previewTools=(await enabled.listTools()).tools.map(t=>t.name);assert.ok(previewTools.includes('preview_project'));assert.ok(!previewTools.includes('save_project'));
 const saveEnabled=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:5298',LVGL_CBOR_ALLOW_SAVE:'1'}),saveTools=(await saveEnabled.listTools()).tools.map(t=>t.name);assert.ok(saveTools.includes('save_project'));assert.ok(!saveTools.includes('preview_project'));
});
test('device client requires a fixed clean HTTP origin and returns connection failures',async()=>{
 for(const origin of ['file:///etc/passwd','http://user:secret@localhost:5298','http://localhost:5298/path','http://localhost:5298/?x=1'])assert.throws(()=>new DeviceClient(origin));
 const d=new DeviceClient('http://localhost:5298',{fetcher:async()=>({ok:false,status:503})});await assert.rejects(d.info(),/503/);
});
test('disabled MCP exits without initialization or protocol output',()=>{
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('./index.js',import.meta.url))],{env:{...process.env,LVGL_CBOR_MCP_ENABLED:'0'},encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,'');assert.equal(run.stderr,'');
});
function fakeDevice(mode='ok'){
 const info={source:'device',contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256},caps={format:'lvgl-cbor-capabilities-1',style:contract,screen:screenContract,limits:{stylePacketBytes:3584},resources:[],availableWidgets:[]};
 return new DeviceClient('http://localhost:5298',{timeout:30,fetcher:async url=>({ok:true,text:async()=>JSON.stringify(url.endsWith('/api/info')?info:mode==='bad-caps'?{}:caps)}),makeSocket:()=>{
  const socket={close(){socket.onclose?.();},send(bytes){if(mode==='timeout')return;if(mode==='closed'){socket.onclose();return;}const id=decodePacket(bytes).get('id');for(const ackId of ['unrelated',id]){
   const bytes=encode({v:1,id:ackId,ok:mode!=='rejected',error:'test-rejection',node:'target',opcode:2,contract_sha256:mode==='bad-ack'?'wrong':contract.sha256});socket.onmessage({data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  }}};queueMicrotask(()=>socket.onopen());return socket;
 }});
}
test('device client verifies capabilities/ACK, ignores foreign replies and releases pending state on failure',async()=>{
 const document={scope:'screen',name:'test',props:{}};
 const ok=fakeDevice();assert.equal((await ok.apply('style',document)).ok,true);assert.equal(ok.busy,false);
 for(const [mode,error] of [['bad-caps',/Device ABI/],['bad-ack',/ACK ABI/],['closed',/before ACK/],['rejected',/target opcode 2: test-rejection/],['timeout',/timeout/]]){
  const device=fakeDevice(mode);await assert.rejects(device.apply('style',document),error);assert.equal(device.busy,false,mode);
 }
 const d=fakeDevice('timeout'),pending=d.apply('style',document);await assert.rejects(d.apply('style',document),/pending/);await assert.rejects(pending,/timeout/);
});

test('MCP project tools preserve bindings/events and nested views through preview, save and readback',async t=>{
 const screen=createBlankScreen('main','Main');screen.root.children=[
  {id:'reading',type:'label',props:{text:'--'},bindings:[{method:'text',value:{source:'app.reading',path:['value']},format:{precision:1,suffix:' bar'}}]},
  {id:'clear',type:'button',props:{text:'Clear'},events:[{event:'clicked',action:'app.clear',args:{literal:null}}]}
 ];
 const child=createBlankScreen('details','Details');
 screen.root.children.push({id:'content',type:'obj',view:{pages:[{screen:'details',retention:'cache'}],initial:'details',sizing:'fill'},children:[]},
  {id:'nav',type:'button',props:{text:'Details'},events:[{event:'clicked',navigate:{view:'content',screen:'details'}}]});
 const base=createProject([screen,child]);let saved=base,revision='v1',upload,previews=0,saves=0;
 const offline=offlineCapabilities(),caps={...offline,source:'device',binding:{...offline.binding,sha256:bindingContract.sha256,
  sources:[{name:'app.reading',schema:{type:'object',fields:{value:'number'}},writable:false}],actions:[{name:'app.clear',schema:'null'}]},
  project:{format:'lvgl-project-service-1',maxBytes:262144}},info={source:'device',contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256};
 const fetcher=fetchFixture(async(request,response)=>{
  const url=new URL(request.url,'http://localhost'),action=url.searchParams.get('action'),chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks);
  const json=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));};
  if(url.pathname==='/api/info')return json(200,info);if(url.pathname==='/api/capabilities')return json(200,caps);
  if(action==='info')return json(200,{project:{id:saved.manifest.id,revision},storage:{writable:true,persistent:false},policy:{replace:true,add:true,remove:true},screens:Object.keys(saved.screens),styles:Object.keys(saved.styles)});
  if(action==='read'){response.writeHead(200,{'Content-Type':'application/cbor','X-Project-Revision':revision});return response.end(encodeProject(saved,caps));}
  if(action==='begin'){upload={...decode(body),bytes:[]};return json(200,{token:'1',chunkBytes:2048});}
  if(action==='chunk'){if(Number(url.searchParams.get('offset'))!==upload.bytes.length)return json(400,{error:'offset'});upload.bytes.push(...body);return json(200,{ok:true});}
  if(action==='cancel'){upload=null;return json(200,{ok:true});}
  if(action==='finish'){if(upload.intent==='save'){if(upload.revision!==revision)return json(409,{error:'project_revision_conflict'});saved=decodeProject(new Uint8Array(upload.bytes),caps);revision='v'+(++saves+1);return json(200,{ok:true,saved:true,revision,persistent:false});}previews++;return json(200,{ok:true,saved:false,nodes:1});}
  return json(404,{error:'unknown action'});
 });
 const origin='http://device.test:5299',client=await connect(t,{LVGL_CBOR_DEVICE:origin,LVGL_CBOR_ALLOW_PREVIEW:'1',LVGL_CBOR_ALLOW_SAVE:'1'},fetcher);
 const device=data(await client.callTool({name:'get_device',arguments:{}}));assert.equal(device.section,'summary');assert.equal(device.counts.sources,1);
 const original=data(await client.callTool({name:'read_project',arguments:{}}));assert.equal(original.revision,'v1');
 assert.deepEqual(original.project.screens.main.root.children[0].bindings,screen.root.children[0].bindings);
 assert.deepEqual(original.project.screens.main.root.children[1].events,screen.root.children[1].events);
 const draft=structuredClone(original.project);draft.manifest.name='Changed via MCP';
 draft.screens.main.root.children[0].bindings[0].format.prefix='Edited ';
 assert.equal(data(await client.callTool({name:'preview_project',arguments:{project:draft,screen:'main'}})).saved,false);assert.equal(saved.manifest.name,base.manifest.name);assert.equal(previews,1);assert.equal(saves,0);
 const result=data(await client.callTool({name:'save_project',arguments:{project:draft,revision:'v1'}}));assert.equal(result.persistent,false);assert.equal(saved.manifest.name,'Changed via MCP');assert.equal(saves,1);
 assert.equal((await client.callTool({name:'save_project',arguments:{project:draft,revision:'v1'}})).isError,true);assert.equal(saves,1);
 const document=data(await client.callTool({name:'read_project_document',arguments:{kind:'screens',name:'main'}}));assert.equal(document.document.id,'main');
 assert.deepEqual(document.document.root.children[0].bindings,draft.screens.main.root.children[0].bindings);
 assert.deepEqual(document.document.root.children[1].events,draft.screens.main.root.children[1].events);
 assert.deepEqual(document.document.root.children[2].view,screen.root.children[2].view);
 assert.deepEqual(document.document.root.children[3].events,screen.root.children[3].events);
 const validated=data(await client.callTool({name:'validate_document',arguments:{kind:'project',document:draft}}));assert.equal(validated.valid,true);assert.equal(validated.checkedAgainst,'device');

 const invalid=structuredClone(draft);invalid.screens.main.root.children[0].bindings[0].value.source='missing.source';
 assert.equal((await client.callTool({name:'validate_document',arguments:{kind:'project',document:invalid}})).isError,true);
 invalid.screens.main.root.children[0].bindings=draft.screens.main.root.children[0].bindings;
 invalid.screens.main.root.children[1].events=[{event:'clicked',action:'missing.action',args:{literal:null}}];
 assert.equal((await client.callTool({name:'save_project',arguments:{project:invalid,revision}})).isError,true);assert.equal(saves,1);
 const missingPage=structuredClone(draft);missingPage.screens.main.root.children[2].view.initial='missing';
 assert.equal((await client.callTool({name:'preview_project',arguments:{project:missingPage,screen:'main'}})).isError,true);assert.equal(previews,1);
 const tree=data(await client.callTool({name:'read_project_document',arguments:{kind:'screens',name:'main',outline:true}}));assert.equal(tree.outline.root.children[1].id,'clear');assert.equal(tree.outline.root.children[1].props,undefined);
 const part=data(await client.callTool({name:'read_project_document',arguments:{kind:'screens',name:'main',node:'clear'}}));const beforeNodeWrite=structuredClone(saved);part.document.props.text='Edited clear';
 const nodeSaved=data(await client.callTool({name:'write_project_document',arguments:{kind:'screens',name:'main',node:'clear',document:part.document,revision:part.revision}}));assert.equal(nodeSaved.saved,true);assert.equal(nodeSaved.displayUpdatedBySave,false);assert.match(nodeSaved.note,/Saved only/);
 beforeNodeWrite.screens.main.root.children[1].props.text='Edited clear';assert.deepEqual(saved,beforeNodeWrite);assert.equal(saves,2);
 assert.equal((await client.callTool({name:'write_project_document',arguments:{kind:'screens',name:'main',node:'clear',document:part.document,revision:part.revision}})).isError,true);assert.equal(saves,2);

});

test('runtime mutations have an independent opt-in and conservative tool annotations',async t=>{
 const ro=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:5299',LVGL_CBOR_ALLOW_PREVIEW:'1',LVGL_CBOR_ALLOW_SAVE:'1'});
 const readonly=(await ro.listTools()).tools.map(tool=>tool.name);
 assert.ok(readonly.includes('get_data'));assert.ok(readonly.includes('get_data_command'));
 for(const name of ['invoke_action','write_source','send_event'])assert.ok(!readonly.includes(name));
 const rw=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:5299',LVGL_CBOR_ALLOW_DATA:'1'}),tools=(await rw.listTools()).tools;
 for(const name of ['invoke_action','write_source','send_event']){
  const tool=tools.find(tool=>tool.name===name);assert.equal(tool.annotations.readOnlyHint,false);assert.equal(tool.annotations.destructiveHint,true);
 }
 assert.ok(!tools.some(tool=>['save_project','preview_project'].includes(tool.name)));
});

test('MCP discovers grouped catalog in bounded pages and keeps device context selective',async t=>{
 const capabilities={...offlineCapabilities(),source:'device',display:{width:800,height:480}};
 capabilities.binding={...capabilities.binding,sources:[{name:'app.speed',title:'Vehicle speed',schema:{type:'number',min:0,max:240}},{name:'app.state',schema:{type:'object',fields:{temperature:'number'}}}],actions:[{name:'app.reset',schema:'null'}]};
 const info={source:'device',name:'Example',boot_id:'test-boot',contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256,verboseDiagnostic:'x'.repeat(12000)};
 const calls=[],allSources=[{name:'app.speed',group:'vehicle',type:'number',title:'Vehicle speed',description:'Measured road speed',unit:'km/h'},{name:'app.state',group:'vehicle',type:'object',fieldCount:1}];
 const fetcher=fetchFixture(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');calls.push({pathname:url.pathname,query:Object.fromEntries(url.searchParams)});
  const json=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));};
  if(url.pathname==='/api/info')return json(200,info);
  if(url.pathname==='/api/capabilities')return json(200,capabilities);
  if(url.pathname!=='/api/data')return json(404,{error:'not_found'});
  const q=url.searchParams;
  if(!q.has('kind'))return json(200,{sources:[],commands:[],diagnostics:{bindingErrors:0}});
  if(Number(q.get('catalogRevision'))!==0&&Number(q.get('catalogRevision'))!==7)return json(409,{error:'data_catalog_revision',catalogRevision:7});
  if(q.get('name')==='large.schema')return json(413,{error:'data_query_record_limit',maxBytes:Number(q.get('maxBytes'))});
  let items;
  switch(q.get('kind')){
   case 'groups':items=[{name:'vehicle',parent:'',title:'Vehicle',description:'Vehicle measurements',sourceCount:2,actionCount:1,groupCount:0}];break;
   case 'sources':items=allSources.filter(source=>(!q.get('group')||source.group===q.get('group'))&&(!q.get('prefix')||source.name.startsWith(q.get('prefix')))).map(source=>q.get('detail')==='true'?{...source,schema:capabilities.binding.sources.find(item=>item.name===source.name).schema}:source);break;
   case 'actions':items=[{name:'app.reset',type:'null'}];break;
   case 'fields':assert.equal(q.get('name'),'app.state');assert.equal(q.get('path'),'');items=[{name:'app.state',group:'vehicle',field:'temperature',path:'/temperature',type:'number',unit:'°C'}];break;
   case 'values':items=[{name:'app.state',path:'/temperature',state:'known',value:23.5}];break;
   default:return json(400,{error:'data_query_kind'});
  }
  const offset=Number(q.get('offset')),limit=Number(q.get('limit')),selected=items.slice(offset,offset+limit),nextOffset=offset+selected.length<items.length?offset+selected.length:null;
  const result={format:'lvgl-data-page-1',catalogRevision:7,revision:11,total:items.length,offset,nextOffset,hasMore:nextOffset!==null,items:selected};
  if(Buffer.byteLength(JSON.stringify(result))>Number(q.get('maxBytes')))return json(413,{error:'data_query_record_limit'});
  return json(200,result);
 });
 const client=await connect(t,{LVGL_CBOR_DEVICE:'http://device.test:5299'},fetcher);
 const call=(name,args={})=>client.callTool({name,arguments:args}),tools=(await client.listTools()).tools;
 assert.ok(tools.some(tool=>tool.name==='get_data_catalog'));assert.ok(!tools.some(tool=>['invoke_action','write_source','send_event'].includes(tool.name)));
 const summary=data(await call('get_device'));assert.equal(summary.section,'summary');assert.equal(summary.counts.sources,2);assert.equal(summary.info.verboseDiagnostic,undefined);assert.equal(summary.capabilities,undefined);
 const widgetList=data(await call('get_device',{section:'widgets',limit:2}));assert.equal(widgetList.items.length,2);assert.equal(widgetList.items[0].methods,undefined);
 const widget=data(await call('get_device',{section:'widgets',name:'label'}));assert.equal(widget.items[0].name,'label');assert.ok(Array.isArray(widget.items[0].methods));
 const style=data(await call('get_device',{section:'styles',name:'bg_color'}));assert.equal(style.items[0].alias,'bg_color');assert.ok(Array.isArray(style.items[0].parameters));assert.equal(style.items[0].opcode,undefined);assert.equal(style.items[0].signature,undefined);
 const layout=data(await call('get_device',{section:'styles',name:'layout'}));assert.equal(layout.items[0].rules.layout.symbols.LV_LAYOUT_FLEX,1);assert.deepEqual(layout.items[0].example.style,{layout:'LV_LAYOUT_NONE'});assert.equal(widget.items[0].id,undefined);assert.ok(widget.items[0].methods.every(m=>m.opcode===undefined));
 const limits=data(await call('get_device',{section:'limits'}));assert.deepEqual(limits.layouts,[0,1,2]);assert.deepEqual(limits.display,{width:800,height:480});
 const before=calls.length,groups=data(await call('get_data_catalog'));assert.equal(groups.items[0].name,'vehicle');assert.equal(groups.items[0].sourceCount,2);
 assert.deepEqual(calls.slice(before).map(call=>call.pathname),['/api/data']);assert.equal(calls.at(-1).query.kind,'groups');assert.equal(calls.at(-1).query.maxBytes,'4096');
 const first=data(await call('get_data_catalog',{kind:'sources',group:'vehicle',limit:1,maxBytes:512}));assert.equal(first.items[0].description,'Measured road speed');assert.equal(first.items[0].unit,'km/h');assert.equal(first.items[0].schema,undefined);
 const second=data(await call('get_data_catalog',{kind:'sources',group:'vehicle',offset:first.nextOffset,limit:1,catalogRevision:first.catalogRevision}));assert.equal(second.items[0].name,'app.state');assert.equal(second.hasMore,false);
 const detailed=data(await call('get_data_catalog',{kind:'sources',prefix:'app.speed',detail:true}));assert.equal(detailed.items[0].schema.max,240);
 const fields=data(await call('get_data_catalog',{kind:'fields',name:'app.state',path:''}));assert.equal(fields.items[0].unit,'°C');
 const values=data(await call('get_data',{name:'app.state',path:'/temperature'}));assert.equal(values.items[0].value,23.5);assert.equal(calls.at(-1).query.kind,'values');
 assert.equal(data(await call('get_data')).items[0].value,23.5,'empty args default to compact values');assert.equal(calls.at(-1).query.kind,'values');
 assert.deepEqual(data(await call('get_data',{snapshot:true})).commands,[],'full snapshot requires explicit opt-in');assert.equal(Object.keys(calls.at(-1).query).length,0);
 assert.equal((await call('get_data',{snapshot:true,name:'app.state'})).isError,true);
 const oversizedAll=await call('get_device',{section:'all',maxBytes:512});assert.equal(oversizedAll.isError,true);assert.ok(!JSON.stringify(oversizedAll).includes('capabilities'));
 const dataSectionBefore=calls.length;assert.equal((await call('get_device',{section:'data'})).isError,true);assert.equal(calls.length,dataSectionBefore);
 for(const [args,status,error] of [[{kind:'sources',catalogRevision:6},409,'data_catalog_revision'],[{kind:'sources',name:'large.schema',detail:true,maxBytes:512},413,'data_query_record_limit']]){
  const result=await call('get_data_catalog',args);assert.equal(result.isError,true);const parsed=JSON.parse(result.content[0].text);assert.equal(parsed.status,status);assert.equal(parsed.error,error);
 }
 assert.equal((await call('get_data_catalog',{limit:65})).isError,true);
});

test('MCP runtime tools use the HTTP data queue, typed values, scoped events and execution receipts',async t=>{
 const caps={...offlineCapabilities(),source:'device'};
 caps.binding={...caps.binding,sources:[{name:'app.state',schema:{type:'object',fields:{values:{type:'array',maxItems:4,items:'integer'}}},writable:true},{name:'app.readonly',schema:'number'}],actions:[{name:'app.configure',schema:{type:'object',fields:{values:{type:'array',maxItems:4,items:'integer'}}}},{name:'app.reject',schema:'null'}]};
 const info={source:'device',contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256};
 const commands=[],receipts=[];let reads=0,selected='overview';
 const fetcher=fetchFixture(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const json=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));};
  if(url.pathname==='/api/info')return json(200,info);if(url.pathname==='/api/capabilities')return json(200,caps);
  if(url.pathname==='/api/project')return json(200,{display:{instance:1,views:[{instance:1,pageInstance:7,node:'content',selected,error:''}]},project:{revision:'unchanged'}});
  if(url.pathname!=='/api/data')return json(404,{error:'not_found'});
  if(request.method==='POST'){
   assert.equal(request.headers['content-type'],'application/cbor');const command=decode(Buffer.concat(chunks));commands.push(command);
   const id=commands.length,error=command.name==='app.reject'?'application_refused':command.instance===999?'data_event_target_or_code':'';
   receipts.push({id,ok:!error,error});if(command.kind==='event'&&!error)selected='details';reads=0;
   return json(202,{queued:true,id});
  }
  return json(200,{sources:[{name:'app.state',state:'known',revision:2,value:{values:[1,2]}},{name:'app.readonly',state:'unknown',revision:0}],diagnostics:{bindingErrors:0},commands:++reads>1?receipts:[]});
 });
 const client=await connect(t,{LVGL_CBOR_DEVICE:'http://device.test:5299',LVGL_CBOR_ALLOW_DATA:'1'},fetcher);
 const call=(name,args={})=>client.callTool({name,arguments:args});
 const snapshot=data(await call('get_data',{snapshot:true}));assert.equal(snapshot.sources[1].state,'unknown');assert.equal(snapshot.diagnostics.bindingErrors,0);
 const action=data(await call('invoke_action',{name:'app.configure',args:{values:[2,3]}}));assert.equal(action.state,'completed');assert.equal(action.result.ok,true);
 const write=data(await call('write_source',{source:'app.state',path:['values',1],value:4}));assert.equal(write.result.ok,true);
 assert.deepEqual(commands[1],{kind:'write',source:'app.state',path:['values',1],value:4});
 assert.equal(data(await call('send_event',{node:'nav',event:'clicked',instance:7})).result.ok,true);
 assert.deepEqual(commands[2],{kind:'event',node:'nav',event:'clicked',instance:7});
 const status=data(await call('get_project_status'));assert.equal(status.display.views[0].pageInstance,7);assert.equal(status.display.views[0].selected,'details');assert.equal(status.project.revision,'unchanged');
 assert.equal(data(await call('send_event',{node:'nav',event:'clicked',wait:false})).state,'queued');assert.ok(!Object.hasOwn(commands[3],'instance'));
 assert.equal(data(await call('get_data_command',{id:4})).state,'unknown');assert.equal(data(await call('get_data_command',{id:4})).result.ok,true);
 const stale=await call('send_event',{node:'nav',event:'clicked',instance:999});assert.equal(stale.isError,true);assert.match(stale.content[0].text,/command 5 rejected: data_event_target_or_code/);
 assert.equal((await call('invoke_action',{name:'app.reject'})).isError,true);
 const count=commands.length;
 for(const [name,args] of [['write_source',{source:'app.readonly',value:1}],['write_source',{source:'app.state',path:['values',9],value:1}],['invoke_action',{name:'app.configure',args:{values:['bad']}}],['invoke_action',{name:'missing'}],['send_event',{node:'nav',event:'clicked',instance:0}]])assert.equal((await call(name,args)).isError,true);
 assert.equal(commands.length,count,'invalid calls never reach the MCU queue');
});

test('MCP display feedback is readonly, uses advertised native capture and bounds binary input',async t=>{
 const bmp=Buffer.alloc(62);bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(-1,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(32,28);bmp.set([0,0,255,0,0,255,0,0],54);
 let mode='ok',frameCalls=0,statusCalls=0;
 const fetcher=fetchFixture(async(request,response)=>{
  const url=new URL(request.url);if(url.pathname==='/api/info'){response.writeHead(200,{'Content-Type':'application/json'});return response.end(JSON.stringify({native_view:mode!=='unsupported'}));}
  if(url.pathname==='/api/view/frame'){frameCalls++;response.writeHead(200,{'Content-Type':mode==='type'?'text/plain':'image/bmp',...(mode==='size'?{'Content-Length':String(9*1024*1024)}:{})});return response.end(bmp);}
  if(url.pathname==='/api/project'&&url.searchParams.get('action')==='info'){statusCalls++;response.writeHead(200,{'Content-Type':'application/json'});return response.end(JSON.stringify({project:{revision:'v1'},display:{screen:'shell',revision:'v1',views:[]}}));}
  throw Error('Unexpected request '+url);
 });
 const client=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:5299'},fetcher),tool=(await client.listTools()).tools.find(tool=>tool.name==='get_display_frame');assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);
 let result=await client.callTool({name:'get_display_frame',arguments:{}});assert.equal(result.isError,undefined,JSON.stringify(result.content));const metadata=JSON.parse(result.content[0].text);assert.deepEqual([metadata.width,metadata.height],[2,1]);assert.equal(metadata.display.revision,'v1');const image=result.content[1];assert.equal(image.type,'image');assert.equal(image.mimeType,'image/png');assert.equal(Buffer.from(image.data,'base64').readUInt32BE(16),2);assert.equal(statusCalls,1);
 for(const [input,pattern] of [['unsupported',/display_capture_unavailable/],['type',/frame_content_type/],['size',/frame_input_size_limit/]]){mode=input;const before=frameCalls;result=await client.callTool({name:'get_display_frame',arguments:{maxEdge:512}});assert.equal(result.isError,true);assert.match(result.content[0].text,pattern);if(input==='unsupported')assert.equal(frameCalls,before);assert.equal(statusCalls,1);}
 result=await client.callTool({name:'get_display_frame',arguments:{maxEdge:127}});assert.equal(result.isError,true);
});
