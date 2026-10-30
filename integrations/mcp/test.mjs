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
import {createServer as createHttpServer} from 'node:http';
import {decode} from 'cborg';
import {encode} from 'cborg';
import {spawnSync} from 'node:child_process';

async function connect(t,env={}){
 const client=new Client({name:'lvgl-cbor-test',version:'0.1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./index.js',import.meta.url))],env:{PATH:process.env.PATH,...env},stderr:'pipe'});
 await client.connect(transport);t.after(()=>client.close());return client;
}
const data=result=>{assert.equal(result.isError,undefined,JSON.stringify(result.content));return JSON.parse(result.content[0].text);};
test('real stdio handshake, tool discovery, CBOR encode/decode, CSS and input errors',async t=>{
 const client=await connect(t),tools=(await client.listTools()).tools.map(t=>t.name);
 assert.deepEqual(tools.sort(),['compile_document','convert_css','decode_document','get_contract','get_example'].sort());
 const example=data(await client.callTool({name:'get_example',arguments:{kind:'screen'}}));assert.equal(example.format,'lvgl-screen-draft-1');
 assert.ok(data(await client.callTool({name:'compile_document',arguments:{kind:'screen',document:example}})).bytes>200);
 const compiled=data(await client.callTool({name:'compile_document',arguments:{kind:'screen',document:createScreen()}}));assert.ok(compiled.bytes>300);assert.equal(compiled.checkedAgainst,'bundled-contract');
 const decoded=data(await client.callTool({name:'decode_document',arguments:{kind:'screen',cborBase64:compiled.cborBase64}}));assert.equal(decoded.root.children.length,2);
 const css=data(await client.callTool({name:'convert_css',arguments:{kind:'screen',document:createScreen(),direction:'import',css:'#root{padding:12px;}'}}));assert.equal(css.ok,true);
 assert.equal((await client.callTool({name:'decode_document',arguments:{kind:'screen',cborBase64:'invalid~'}})).isError,true);
 assert.equal((await client.callTool({name:'compile_document',arguments:{kind:'screen',document:{}}})).isError,true);
 assert.equal(data(await client.callTool({name:'get_contract',arguments:{kind:'binding'}})).version,1);
 assert.equal(data(await client.callTool({name:'get_contract',arguments:{kind:'composition'}})).limits.maxInstances,16);
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

test('real stdio project tools preserve bindings/events and nested views through preview, save and readback',async t=>{
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
 const server=createHttpServer(async(request,response)=>{
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
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port,client=await connect(t,{LVGL_CBOR_DEVICE:origin,LVGL_CBOR_ALLOW_PREVIEW:'1',LVGL_CBOR_ALLOW_SAVE:'1'});
 const device=data(await client.callTool({name:'get_device',arguments:{}}));assert.equal(device.capabilities.binding.sources[0].name,'app.reading');
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
 const compiled=data(await client.callTool({name:'compile_document',arguments:{kind:'project',document:draft}}));assert.equal(compiled.checkedAgainst,'device');
 const decoded=data(await client.callTool({name:'decode_document',arguments:{kind:'project',cborBase64:compiled.cborBase64}}));assert.equal(decoded.manifest.name,draft.manifest.name);
 assert.deepEqual(decoded.screens.main.root.children[0].bindings,draft.screens.main.root.children[0].bindings);
 const invalid=structuredClone(draft);invalid.screens.main.root.children[0].bindings[0].value.source='missing.source';
 assert.equal((await client.callTool({name:'compile_document',arguments:{kind:'project',document:invalid}})).isError,true);
 invalid.screens.main.root.children[0].bindings=draft.screens.main.root.children[0].bindings;
 invalid.screens.main.root.children[1].events=[{event:'clicked',action:'missing.action',args:{literal:null}}];
 assert.equal((await client.callTool({name:'save_project',arguments:{project:invalid,revision}})).isError,true);assert.equal(saves,1);
 const missingPage=structuredClone(draft);missingPage.screens.main.root.children[2].view.initial='missing';
 assert.equal((await client.callTool({name:'preview_project',arguments:{project:missingPage,screen:'main'}})).isError,true);assert.equal(previews,1);
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

test('real stdio runtime tools use the HTTP data queue, typed values, scoped events and execution receipts',async t=>{
 const caps={...offlineCapabilities(),source:'device'};
 caps.binding={...caps.binding,sources:[{name:'app.state',schema:{type:'object',fields:{values:{type:'array',maxItems:4,items:'integer'}}},writable:true},{name:'app.readonly',schema:'number'}],actions:[{name:'app.configure',schema:{type:'object',fields:{values:{type:'array',maxItems:4,items:'integer'}}}},{name:'app.reject',schema:'null'}]};
 const info={source:'device',contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256};
 const commands=[],receipts=[];let reads=0,selected='overview';
 const server=createHttpServer(async(request,response)=>{
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
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const client=await connect(t,{LVGL_CBOR_DEVICE:'http://127.0.0.1:'+server.address().port,LVGL_CBOR_ALLOW_DATA:'1'});
 const call=(name,args={})=>client.callTool({name,arguments:args});
 const snapshot=data(await call('get_data'));assert.equal(snapshot.sources[1].state,'unknown');assert.equal(snapshot.diagnostics.bindingErrors,0);
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
