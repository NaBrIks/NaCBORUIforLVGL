// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {createConnection} from 'node:net';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {encode,decode} from 'cborg';
import {screenContract} from '../../packages/screen-codec/index.js';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
const executableSha256=createHash('sha256').update(await readFile(exe)).digest('hex');
const require=createRequire(new URL('../../integrations/mcp/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-production-api-')),store=join(temporary,'кириллица папка','сохранённый проект'),output=join(root,'local/windows-api');
const wait=ms=>new Promise(yes=>setTimeout(yes,ms)),rgb=hex=>parseInt(hex.slice(1),16);
const roots=[{id:'root'},{id:'choose_pony'},{id:'choose_space'},{id:'mean'},{id:'level'},{id:'api_counter'}];
let active;

async function launch(){
 const child=spawn(process.execPath,[join(here,'run.mjs'),join(here,'registry-demo.json'),'--schemes',join(here,'registry-schemes.json'),'--exe',exe,'--api-port','0','--api-store',store,'--control','--hidden','--no-settings'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let next=0,stderr='',closed=false,readyResolve,readyReject,api,loaded=false;
 const pending=new Map(),ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;});
 const startup=setTimeout(()=>readyReject(Error('Windows API startup timeout '+stderr)),15000);
 child.stderr.on('data',chunk=>stderr+=chunk);
 createInterface({input:child.stdout}).on('line',line=>{
  let event;try{event=JSON.parse(line);}catch{return;}
  if(event.event==='loaded')loaded=true;
  if(event.event==='api_ready')api=event.url;
  if(event.event==='fatal'||event.event==='error'){readyReject(Error(event.error+' '+stderr));}
  if(api&&loaded){clearTimeout(startup);readyResolve(api);}
  if(event.id!==undefined&&pending.has(event.id)){const p=pending.get(event.id);pending.delete(event.id);clearTimeout(p.timer);p.yes(event);}
 });
 const exit=new Promise(yes=>child.once('close',code=>{closed=true;clearTimeout(startup);readyReject(Error('Player closed '+code+' '+stderr));for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('Player closed '+code));}pending.clear();yes(code);}));
 const command=request=>new Promise((yes,no)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);no(Error('Player command timeout '+JSON.stringify(request)+' '+stderr));},8000);pending.set(id,{yes,no,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});
 let mcp;const sockets=[];
 const session={child,command,sockets,get url(){return api;},get mcp(){return mcp;},get stderr(){return stderr;},async stop(){for(const socket of sockets)socket.close();await mcp?.close().catch(()=>{});mcp=null;if(!closed){child.stdin.end('{"op":"quit"}\n');await Promise.race([exit,wait(3000).then(()=>child.kill())]);}clearTimeout(startup);for(const p of pending.values())clearTimeout(p.timer);return exit;}};
 active=session;
 const url=new URL(await ready);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'443');assert.notEqual(url.port,'0');
 mcp=new Client({name:'windows-production-api-test',version:'1.0.0'});
 await mcp.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'integrations/mcp/index.js')],cwd:root,env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:url.origin,LVGL_CBOR_ALLOW_PREVIEW:'1',LVGL_CBOR_ALLOW_SAVE:'1',LVGL_CBOR_ALLOW_DATA:'1'},stderr:'pipe'}));
 session.call=(name,args={})=>mcp.callTool({name,arguments:args},undefined,{timeout:20000});
 session.result=async(name,args={})=>{const r=await session.call(name,args);assert.equal(r.isError,undefined,JSON.stringify(r.content));return JSON.parse(r.content[0].text);};
 return session;
}
function healthy(r){assert.equal(r.ok,true,r.error);assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);const d=JSON.parse(r.dataJson).diagnostics;assert.equal(d.bindingErrors,0);assert.equal(d.queueDropped,0);}
const source=(r,name)=>JSON.parse(r.dataJson).sources.find(item=>item.name===name);
const inspect=async(session,nodes=roots)=>{const r=await session.command({op:'inspect',nodes});healthy(r);return r;};
const pick=r=>r.nodes.filter(n=>n.found).map(({id,bounds,background,radius,borderWidth,outlineWidth,outlinePad})=>({id,bounds,background,radius,borderWidth,outlineWidth,outlinePad}));
async function settle(session,predicate,message){const end=Date.now()+5000;let r;do{await wait(30);r=await inspect(session);if(predicate(r))return r;}while(Date.now()<end);assert.fail(message);}
async function connectSocket(session,path){
 const url=new URL(path,session.url);url.protocol='ws:';const socket=new WebSocket(url);socket.binaryType='arraybuffer';session.sockets.push(socket);
 let close=null,lastError=null;socket.addEventListener('close',event=>{close={code:event.code,reason:event.reason,wasClean:event.wasClean};});socket.addEventListener('error',event=>{lastError=event.error?.message??'WebSocket error';});
 const diagnostic=()=>JSON.stringify({path,readyState:socket.readyState,close,lastError,launcherExitCode:session.child.exitCode,nativeStderr:session.stderr.slice(-8192)});
 const frames=[];socket.addEventListener('message',event=>{try{assert.ok(event.data instanceof ArrayBuffer);frames.push(decode(new Uint8Array(event.data)));}catch(error){frames.push({decodeError:error.message});}});
 await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('WebSocket open timeout '+diagnostic())),5000);socket.addEventListener('open',()=>{clearTimeout(timer);yes();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);no(Error('WebSocket open failed '+diagnostic()));},{once:true});});
 const validFrames=()=>assert.ok(!frames.some(frame=>frame.decodeError),diagnostic());
 return {socket,frames,async until(predicate){const end=Date.now()+5000;do{validFrames();const frame=frames.find(predicate);if(frame)return frame;assert.ok(!close&&!lastError,'WebSocket ended before the required event: '+diagnostic());await wait(20);}while(Date.now()<end);assert.fail('Missing WebSocket frame '+path+' '+JSON.stringify(frames.filter(frame=>frame.event!=='data_changed').map(({value,...frame})=>frame))+'; data frames: '+frames.filter(frame=>frame.event==='data_changed').length+'; diagnostic: '+diagnostic());},async rejected(id){
  const end=Date.now()+5000;do{validFrames();const ack=frames.find(frame=>frame.id===id&&typeof frame.ok==='boolean');if(ack){assert.equal(ack.ok,false);return {id,outcome:'ack',error:ack.error};}if(close)return {id,outcome:'close',...close,lastError};await wait(20);}while(Date.now()<end);assert.fail('Unsupported command received neither exact-ID rejection nor explicit close: '+id+' '+diagnostic());
 }};
}
function httpProbe(origin,{path='/api/info',method='GET',headers={},body}={}){
 return new Promise((yes,no)=>{
  const target=new URL(origin),payload=Buffer.from(body??''),fields={Host:target.host,Connection:'close',...(payload.length?{'Content-Length':String(payload.length)}:{}),...headers};let received='';
  const socket=createConnection({host:target.hostname,port:Number(target.port)},()=>{socket.write(method+' '+path+' HTTP/1.1\r\n'+Object.entries(fields).map(([name,value])=>name+': '+value+'\r\n').join('')+'\r\n');if(payload.length)socket.write(payload);});
  socket.setTimeout(5000,()=>socket.destroy(Error('HTTP probe timeout')));socket.on('error',no);socket.on('data',bytes=>{received+=bytes;if(received.length>16384)socket.destroy(Error('HTTP probe response limit'));const status=received.match(/^HTTP\/1\.[01] (\d{3}) [^\r\n]*\r\n/),head=received.indexOf('\r\n\r\n');if(status&&head>=0&&(status[1]==='101'||received.length>=head+4+Number(received.slice(0,head).match(/content-length:\s*(\d+)/i)?.[1]??0))){yes({status:Number(status[1]),response:received});socket.destroy();}});socket.on('end',()=>no(Error('Missing HTTP probe status')));
 });
}
async function rejectedDataCommand(session,args){
 const response=await fetch(new URL('/api/data',session.url),{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode({kind:'action',name:'demo.step',args}),signal:AbortSignal.timeout(5000)});
 assert.equal(response.status,202);const queued=await response.json();assert.equal(queued.queued,true);assert.ok(Number.isSafeInteger(queued.id)&&queued.id>0);
 const end=Date.now()+5000;let receipt;
 do{receipt=await session.result('get_data_command',{id:queued.id});if(receipt.state==='completed')break;await wait(30);}while(Date.now()<end);
 assert.equal(receipt.state,'completed');assert.equal(receipt.result.ok,false);assert.ok(receipt.result.error);
 assert.equal((await session.result('get_device')).section,'summary');
 assert.equal((await session.result('get_data',{name:'demo.clicks'})).items[0].value,5);
 assert.equal(source(await inspect(session),'demo.clicks').value,5,'a rejected CBOR argument must not execute the action');
 return {id:queued.id,error:receipt.result.error};
}
function draftProject(base){
 const draft=structuredClone(base);draft.manifest.name='Authored through production MCP';
 const screen=draft.screens[draft.manifest.entry];
 draft.styles['agent.api.canvas']={scope:'global',name:'agent.api.canvas',attach:false,props:{bg_color:'#eee9f4'}};
 draft.styles['agent.api.button']={scope:'global',name:'agent.api.button',attach:false,props:{bg_color:'#4b357d',text_color:'#ffffff',radius:11,border_width:2,border_color:'#987bbb'}};
 screen.root.styles.push({ref:'global-dynamic:agent.api.canvas'});
 screen.styles.choice_geometry.props.radius=3;
 const choices=screen.root.children.find(node=>node.id==='choices');
 for(const node of choices.children)node.styles.push({ref:'global-dynamic:agent.api.button'});
 choices.children.find(node=>node.id==='choose_space').common={add_state:screenContract.states.FOCUSED};
 choices.children.push({id:'api_step',type:'button',props:{text:'Step'},style:{width:70,height:38,flex_grow:0,text_font:'ui_14'},styles:[{ref:'global-static:ui.button'},{ref:'screen:choice_geometry'},{ref:'global-dynamic:agent.api.button'}],events:[{event:'clicked',action:'demo.step',args:{literal:2}}]});
 screen.root.children.splice(screen.root.children.findIndex(node=>node.id==='metrics')+1,0,{id:'api_counter',type:'label',style:{width:{pct:100},height:22,text_font:'ui_14'},styles:[{ref:'global-static:ui.text'}],props:{text:'--'},bindings:[{method:'text',value:{source:'demo.clicks'},format:{prefix:'Actions: '}}]});
 return draft;
}
try{
 await mkdir(output,{recursive:true});let session=await launch();
 const htmlResponse=await fetch(session.url);assert.equal(htmlResponse.status,200);assert.match(htmlResponse.headers.get('content-type'),/text\/html/);const html=await htmlResponse.text();assert.match(html,/<div id="app">/);
 const info=await (await fetch(new URL('/api/info',session.url))).json();assert.equal(info.platform,'windows');assert.equal(info.server,'NaWServer');
 assert.equal((await httpProbe(session.url,{headers:{Host:'foreign.invalid'}})).status,403);
 assert.equal((await httpProbe(session.url,{headers:{Origin:'http://foreign.invalid:5301'}})).status,403);
 assert.equal((await httpProbe(session.url,{path:'/api/data',method:'POST',headers:{'Content-Type':'text/plain'},body:'x'})).status,415);
 assert.equal((await httpProbe(session.url,{path:'/api/data',method:'POST',headers:{'Content-Type':'application/cbor','Content-Length':'4097'},body:Buffer.alloc(4097)})).status,413);
 const script=html.match(/<script[^>]+src="([^"]+)"/);assert.ok(script,'native NaWServer must serve the built editor');const asset=await fetch(new URL(script[1],session.url));assert.equal(asset.status,200);assert.ok((await asset.arrayBuffer()).byteLength>100);
 const upgrade=await httpProbe(session.url,{path:'/ws',headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'AAECAwQFBgcICQoLDA0ODw=='}});assert.equal(upgrade.status,101,upgrade.response);
 let styleSocket=await connectSocket(session,'/ws'),screenSocket=await connectSocket(session,'/screen-ws');const webSocketRejections=[];
 const tools=(await session.mcp.listTools()).tools.map(t=>t.name);for(const name of ['get_device','get_data_catalog','read_project','preview_project','save_project','show_project_screen','reset_project_changes','invoke_action','write_source','send_event'])assert.ok(tools.includes(name),name);
 const summary=await session.result('get_device');assert.equal(summary.section,'summary');assert.equal(summary.capabilities,undefined);
 const groups=await session.result('get_data_catalog');assert.ok(groups.items.some(group=>group.name==='demo'));
 assert.equal((await session.command({op:'add_demo_sensor',name:'demo.api_temperature'})).ok,true);
 const catalogPage=await session.result('get_data_catalog',{kind:'sources',name:'demo.api_temperature'});
 const catalogEvent=await styleSocket.until(frame=>frame.event==='data_catalog_changed'&&frame.catalogRevision===catalogPage.catalogRevision);assert.equal(catalogEvent.v,1);
 const original=await session.result('read_project'),status=await session.result('get_project_status');assert.equal(status.storage.persistent,true);assert.equal(status.storage.writable,true);
 let r=await inspect(session);const originalGeometry=pick(r);assert.equal(r.historyAvailable,true);
 const draft=draftProject(original.project),entry= draft.manifest.entry;
 const invalid=structuredClone(draft);invalid.styles['agent.api.button'].props.unknown_style_property=1;
 assert.equal((await session.call('preview_project',{project:invalid,screen:entry})).isError,true);
 assert.deepEqual(pick(await inspect(session)),originalGeometry,'rejected style preserves the real native UI');
 for(let attempt=0;attempt<6;attempt++){
  const styleId='api-style-invalid-'+attempt,screenId='api-screen-invalid-'+attempt;
  styleSocket.socket.send(encode({v:1,id:styleId}));screenSocket.socket.send(encode({v:1,id:screenId}));
  const [styleResult,screenResult]=await Promise.all([styleSocket.rejected(styleId),screenSocket.rejected(screenId)]);webSocketRejections.push({style:styleResult,screen:screenResult});
  if(styleResult.outcome==='close')styleSocket=await connectSocket(session,'/ws');
  if(screenResult.outcome==='close')screenSocket=await connectSocket(session,'/screen-ws');
 }
 const pressureSocket=await connectSocket(session,'/ws'),pressureIds=Array.from({length:16},(_,index)=>'api-pressure-'+index);
 for(const id of pressureIds)pressureSocket.socket.send(encode({v:1,id}));
 const webSocketPressure=await Promise.all(pressureIds.map(id=>pressureSocket.rejected(id)));
 styleSocket.socket.close();
 styleSocket=webSocketPressure.some(result=>result.outcome==='close')||pressureSocket.socket.readyState!==WebSocket.OPEN?await connectSocket(session,'/ws'):pressureSocket;
 assert.equal((await styleSocket.until(frame=>frame.event==='data_catalog_changed'&&frame.catalogRevision===catalogPage.catalogRevision)).v,1);
 assert.deepEqual(pick(await inspect(session)),originalGeometry,'rejected CBOR WS packets preserve the native UI');
 const preview=await session.result('preview_project',{project:draft,screen:entry});assert.equal(preview.saved,false);
 r=await inspect(session);assert.equal(r.nodes.find(n=>n.id==='root').background,rgb('#eee9f4'));assert.equal(r.nodes.find(n=>n.id==='choose_pony').radius,11);assert.equal(r.nodes.find(n=>n.id==='choose_space').outlineWidth,3);assert.equal(r.nodes.find(n=>n.id==='choose_space').outlinePad,2);
 const afterPreview=await session.result('read_project');assert.equal(afterPreview.revision,original.revision);assert.equal(afterPreview.project.styles['agent.api.button'],undefined,'native preview leaves the store unchanged');
 assert.equal((await session.command({op:'snapshot',path:join(output,'preview.bmp')})).ok,true);
 const saved=structuredClone(draft);saved.manifest.name='Persisted API design';saved.styles['agent.api.canvas'].props.bg_color='#e2f1e9';saved.styles['agent.api.button'].props.bg_color='#235c52';saved.styles['agent.api.button'].props.radius=15;
 const beforeSave=pick(await inspect(session));const save=await session.result('save_project',{project:saved,revision:afterPreview.revision});assert.equal(save.persistent,true);assert.equal(save.saved,true);
 const cacheName='сохранённый проект.base.'+status.project.baseRevision+'.0';
 assert.deepEqual((await readdir(dirname(store))).sort(),['сохранённый проект.0',cacheName].sort(),'native storage and immutable base cache preserve exact Unicode filenames');
 assert.deepEqual(pick(await inspect(session)),beforeSave,'saving project B keeps preview A displayed');
 const afterSave=await session.result('read_project');assert.equal(afterSave.project.styles['agent.api.button'].props.radius,15);assert.notEqual(afterSave.revision,original.revision);
 const projectEvent=await styleSocket.until(frame=>frame.event==='project_changed'&&frame.revision===afterSave.revision);assert.equal(projectEvent.v,1);
 const conflict=await session.call('save_project',{project:draft,revision:original.revision});assert.equal(conflict.isError,true);assert.match(conflict.content[0].text,/revision|409/i);assert.deepEqual(pick(await inspect(session)),beforeSave);
 assert.equal((await session.result('show_project_screen',{screen:entry})).ok,true);
 r=await inspect(session);assert.equal(r.nodes.find(n=>n.id==='root').background,rgb('#e2f1e9'));assert.equal(r.nodes.find(n=>n.id==='choose_pony').radius,15);
 const write=await session.result('write_source',{source:'demo.level',value:27});assert.equal(write.state,'completed');assert.equal(write.result.ok,true);
 assert.equal((await styleSocket.until(frame=>frame.event==='data_changed'&&frame.source==='demo.level'&&frame.value===27)).v,1);
 const action=await session.result('invoke_action',{name:'demo.step',args:3});assert.equal(action.state,'completed');assert.equal(action.result.ok,true);
 const event=await session.result('send_event',{node:'api_step',event:'clicked'});assert.equal(event.state,'completed');assert.equal(event.result.ok,true);
 assert.equal((await session.result('get_data_command',{id:event.id})).result.ok,true);
 r=await settle(session,r=>r.nodes.find(n=>n.id==='level').value===27&&r.nodes.find(n=>n.id==='api_counter').text==='Actions: 5','real bindings did not reflect action/write/event');assert.equal(source(r,'demo.clicks').value,5);
 const byteArgument=await rejectedDataCommand(session,new Uint8Array([1]));
 let deepArgument=1;for(let depth=0;depth<32;depth++)deepArgument=[deepArgument];
 const deepArgumentReceipt=await rejectedDataCommand(session,deepArgument);
 for(const n of r.nodes.filter(n=>n.found)){if(n.parentBounds){const [x,y,x2,y2]=n.bounds,[a,b,c,d]=n.parentBounds;assert.ok(x>=a&&y>=b&&x2<=c&&y2<=d,n.id+' stays inside its parent');}}
 assert.equal((await session.command({op:'snapshot',path:join(output,'saved-shown.bmp')})).ok,true);
 const firstUrl=session.url;assert.equal(await session.stop(),0);active=null;
 session=await launch();const restored=await session.result('read_project');assert.equal(restored.project.styles['agent.api.button'].props.radius,15);
 r=await inspect(session);assert.equal(r.nodes.find(n=>n.id==='root').background,rgb('#e2f1e9'));assert.equal(r.nodes.find(n=>n.id==='choose_pony').radius,15);assert.equal((await session.result('get_project_status')).storage.persistent,true);
 assert.equal((await session.command({op:'snapshot',path:join(output,'restored.bmp')})).ok,true);
 await session.result('reset_project_changes',{revision:restored.revision});const reset=await session.result('read_project');assert.equal(reset.project.styles['agent.api.button'],undefined);
 assert.deepEqual((await readdir(dirname(store))).sort(),['сохранённый проект.0','сохранённый проект.1',cacheName].sort(),'both owner slots and the immutable base cache preserve exact Unicode filenames');
 assert.equal((await inspect(session)).nodes.find(n=>n.id==='choose_pony').radius,15,'resetting storage does not switch the current display');
 assert.equal((await session.result('show_project_screen',{screen:original.project.manifest.entry})).ok,true);assert.equal((await inspect(session)).nodes.find(n=>n.id==='choose_pony').radius,0);
 await writeFile(join(output,'measurements.json'),JSON.stringify({server:'NaWServer',executableSha256,editorHtml:true,httpGuards:{foreignHost:403,foreignOrigin:403,contentType:415,commandBytes:413},webSocketRejectedPairs:6,webSocketRejections,webSocketPressure,webSocketProjectEvent:projectEvent,webSocketCatalogEvent:catalogEvent,unicodeStore:true,rejectedArguments:{byteString:byteArgument,nestedArray:deepArgumentReceipt},temporaryPorts:[new URL(firstUrl).port,new URL(session.url).port],originalRevision:original.revision,savedRevision:afterSave.revision,restoredRevision:restored.revision,resetRevision:reset.revision,previewGeometry:beforeSave,restoredGeometry:pick(r)},null,2));
 assert.equal(await session.stop(),0);active=null;
 console.log('PASS: native NaWServer editor HTML/assets, CBOR WebSockets and project_changed -> real stdio MCP -> actual ProjectService preview/save/show/reset, Unicode file-store restart, revision conflict, authored stacked styles, invalid style preservation, write/action/event receipts, rejected byte/deep CBOR arguments without crashing, live bindings and hidden UI');
}finally{await active?.stop();await rm(temporary,{recursive:true,force:true});}
