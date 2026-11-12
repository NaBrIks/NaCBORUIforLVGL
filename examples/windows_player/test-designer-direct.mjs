// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Real hidden native acceptance of Designer's in-WebView tool functions. Node is
// only the test/launcher runtime; no MCP server, API fixture or OS input is used.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createBrowserTools} from '../../tools/designer/browser-tools/tools.js';
import {nativeFetcher,bytesToBase64,base64ToBytes} from '../../tools/designer/browser-tools/http.js';
import {connectNativeApi} from './native-api.mjs';
import {encodeProject,decodeProject} from '../../packages/project-codec/index.js';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-mcp-off/Release/nacborui_player.exe'));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-designer-direct-')),store=join(temporary,'Р С”Р С‘РЎР‚Р С‘Р В»Р В»Р С‘РЎвЂ Р В° Р С—Р В°Р С—Р С”Р В°','direct project');
const output=join(root,'local/windows-designer-direct'),sessions=new Set(),wait=ms=>new Promise(done=>setTimeout(done,ms));
const report={executableSha256:createHash('sha256').update(await readFile(exe)).digest('hex'),checks:[],requests:[]};
let failures=0;
function check(condition,message){assert.ok(condition,message);report.checks.push(message);}
function unwrap(result){assert.notEqual(result.isError,true,result.content?.map(item=>item.text).join('\n'));const text=result.content?.find(item=>item.type==='text')?.text;assert.equal(typeof text,'string');return JSON.parse(text);}
async function launch(){
 const child=spawn(process.execPath,[join(here,'run.mjs'),join(here,'graphics-gallery.json'),'--profile','graphics','--exe',exe,'--api-port','0','--api-store',store,'--control','--hidden','--no-settings'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let loaded=false,url,stderr='',closed=false,next=0,readyResolve,readyReject;
 const pending=new Map(),ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;}),startup=setTimeout(()=>readyReject(Error('Direct Designer startup timeout '+stderr)),20000);
 child.stdin.on('error',()=>{});child.stderr.on('data',bytes=>stderr+=bytes);
 createInterface({input:child.stdout}).on('line',line=>{
  let message;try{message=JSON.parse(line);}catch{return;}
  if(message.event==='loaded')loaded=true;if(message.event==='api_ready')url=message.url;
  if(message.event==='fatal'||message.event==='error')readyReject(Error(message.error+' '+stderr));
  if(loaded&&url){clearTimeout(startup);readyResolve();}
  if(message.id!==undefined&&pending.has(message.id)){const job=pending.get(message.id);pending.delete(message.id);clearTimeout(job.timer);job.resolve(message);}
 });
 const exit=new Promise(done=>child.once('close',code=>{closed=true;clearTimeout(startup);readyReject(Error('Direct player exited '+code+' '+stderr));for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Direct player exited'));}pending.clear();done(code);}));
 const session={get origin(){return url;},get stderr(){return stderr;},command(request){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native inspect timeout '+stderr));},8000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});},async stop(){session.tools?.dispose();if(!closed){child.stdin.end('{"op":"quit"}\n');let timer;await Promise.race([exit,new Promise(done=>timer=setTimeout(()=>{child.kill();done();},3000))]);clearTimeout(timer);}clearTimeout(startup);sessions.delete(session);return exit;}};
 sessions.add(session);
 try{
  await ready;const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.notEqual(target.port,'443');assert.notEqual(target.port,'0');
  // This is the same byte callback boundary used by the C# HTTP adapter. It
  // forwards requests to real NaWServer and never synthesizes an API response.
  const sendHttp=async request=>{
   const address=new URL(request.url);assert.equal(address.origin,target.origin);assert.notEqual(address.pathname,'/mcp');
   const headers=new Headers(request.headers);headers.set('Connection','close');
   const response=await fetch(address,{method:request.method,headers,body:request.body===undefined?undefined:base64ToBytes(request.body),redirect:'error',signal:AbortSignal.timeout(65000)});
   const bytes=new Uint8Array(await response.arrayBuffer());report.requests.push({method:request.method,path:address.pathname,action:address.searchParams.get('action'),status:response.status,bytes:bytes.length});
   return {status:response.status,headers:Object.fromEntries(response.headers),body:bytesToBase64(bytes)};
  };
  session.tools=createBrowserTools({origin:target.origin,fetcher:nativeFetcher(target.origin,sendHttp),references:{screen:await readFile(join(root,'tools/designer/prompts/assistant-layout-reference.md'),'utf8'),style:await readFile(join(root,'tools/designer/prompts/assistant-styles-reference.md'),'utf8')},example:JSON.parse(await readFile(join(root,'examples/screens/agent-grid-controls.json'),'utf8'))});
  session.connected=await session.tools.connect();session.invoke=async(name,args={})=>unwrap(await session.tools.call(name,args));
  session.api=await connectNativeApi(target.origin);
  return session;
 }catch(error){await session.stop();throw error;}
}
function healthy(result){assert.equal(result.ok,true,result.error);assert.equal(result.windowVisible,false);assert.equal(result.foreground,false);const diagnostics=JSON.parse(result.dataJson).diagnostics;assert.equal(diagnostics.bindingErrors,0);assert.equal(diagnostics.queueDropped,0);}
async function inspect(session,instance){const result=await session.command({op:'inspect',nodes:[{id:'root',instance},{id:'direct_step',instance},{id:'direct_count',instance},{id:'direct_theme',instance}]});healthy(result);return result;}
function canvasView(status){const view=status.display.views.find(view=>view.node==='content'||view.id==='content'||view.selected==='canvas');assert.ok(view,'content view');return view;}
async function values(session,name){const response=await session.invoke('get_data',{name,detail:true});const item=response.items.find(item=>item.name===name);assert.ok(item,'value '+name);return item.value;}
async function until(read,predicate,message){let result;for(const deadline=Date.now()+5000;Date.now()<deadline;){result=await read();if(predicate(result))return result;await wait(30);}assert.fail(message+' '+JSON.stringify(result));}
function author(base){
 const next=structuredClone(base);next.manifest.name='Designer Direct API authored project';
 next.styles['direct.canvas']={scope:'global',name:'direct.canvas',attach:false,props:{bg_color:'#203044',bg_opa:255}};
 next.styles['direct.button']={scope:'global',name:'direct.button',attach:false,props:{bg_color:'#74529b',text_color:'#ffffff',radius:12,border_width:2,border_color:'#b5a0ca'}};
 next.styles['theme.trial.canvas']={scope:'global',name:'theme.trial.canvas',attach:false,props:{bg_color:'#181a24'}};
 next.styles['theme.trial.button']={scope:'global',name:'theme.trial.button',attach:false,props:{bg_color:'#3850a4'}};
 const screen=next.screens.canvas;screen.name='Direct authored canvas';screen.root.style.layout='LV_LAYOUT_NONE';screen.root.styles.push({ref:'global-dynamic:direct.canvas'});
 screen.root.children=[
  {id:'direct_step',type:'button',props:{text:'Direct +7'},styles:[{ref:'global-dynamic:direct.button'}],style:{x:24,y:24,width:180,height:52,text_font:'ui_20'},events:[{event:'clicked',action:'demo.step',args:{literal:7}}]},
  {id:'direct_count',type:'label',props:{text:'--'},styles:[{ref:'global-static:ui.text'}],style:{x:24,y:104,width:300,height:32,text_font:'ui_20'},bindings:[{method:'text',value:{source:'demo.clicks'},format:{prefix:'Local: '}}]},
  {id:'direct_theme',type:'button',props:{text:'Trial'},styles:[{ref:'global-static:ui.button'}],style:{x:24,y:150,width:180,height:52,text_font:'ui_20'},events:[{event:'clicked',action:'ui.select_scheme',args:{literal:'trial'}}]}
 ];return next;
}
try{
 await mkdir(output,{recursive:true});let session=await launch();
 const tools=session.connected.tools,names=new Set(tools.map(tool=>tool.name));
 check(names.size===tools.length&&['get_data_catalog','get_project_status','read_project','save_project','write_project_document','invoke_action','send_event'].every(name=>names.has(name)),'required local authoring tools are available without duplicates');
 check(session.connected.device.platform==='windows'&&session.connected.device.server==='NaWServer','connected to real native Windows NaWServer');
 const missingMcp=await fetch(new URL('/mcp',session.origin),{method:'GET',headers:{Connection:'close'}});report.mcpProbe={status:missingMcp.status,body:(await missingMcp.text()).slice(0,256)};check([404,405].includes(missingMcp.status),'Direct API works without a GET MCP route: '+JSON.stringify(report.mcpProbe));
 const summary=await session.invoke('get_device',{});check(summary.info.source==='device'&&summary.counts.widgets>0,'real capabilities are used by local discovery');
 const groups=await session.invoke('get_data_catalog',{kind:'groups'});check(groups.items.some(group=>group.name==='demo'),'real registered data groups discovered');
 const sources=await session.invoke('get_data_catalog',{kind:'sources',name:'demo.clicks',detail:true});check(sources.items.length===1,'real demo.clicks source discovered');
 const actions=await session.invoke('get_data_catalog',{kind:'actions',name:'demo.step',detail:true});check(actions.items.length===1,'real demo.step action discovered');
 const original=await session.invoke('read_project',{}),independent=await session.api.read();assert.deepEqual(original,independent);
 const initialStatus=await session.invoke('get_project_status',{});check(initialStatus.storage.persistent===true,'persistent native FileProjectStore is available');
 const project=author(original.project);assert.equal((await session.invoke('validate_document',{kind:'project',document:project})).valid,true);
 await session.invoke('preview_project',{project,screen:'shell'});assert.deepEqual((await session.invoke('read_project',{})).project,original.project);
 check(true,'author JSON compiled by shared codecs and preview does not save');
 const navigate=await session.invoke('send_event',{node:'go_canvas',event:'clicked'});check(navigate.state==='completed'&&navigate.result.ok,'ordinary navigation event completed on native UI task');
 let status=await session.invoke('get_project_status',{}),view=canvasView(status);assert.equal(view.selected,'canvas');const initialInstance=view.pageInstance;assert.ok(initialInstance>0);
 let native=await inspect(session,initialInstance);const button=native.nodes.find(node=>node.id==='direct_step'),canvas=native.nodes.find(node=>node.id==='root');
 check(button.found&&button.radius===12&&button.background===0x74529b&&canvas.background===0x203044,'authored button and canvas styles are visible in real LVGL');
 const countBefore=await values(session,'demo.clicks');
 const clicked=await session.invoke('send_event',{node:'direct_step',event:'clicked',instance:initialInstance});assert.equal(clicked.state,'completed');assert.equal(clicked.result.ok,true);
 await until(()=>values(session,'demo.clicks'),count=>count===countBefore+7,'button callback did not change source');
 native=await until(()=>inspect(session,initialInstance),result=>result.nodes.find(node=>node.id==='direct_count')?.text==='Local: '+(countBefore+7),'binding did not update native label');
 check(true,'real child button event changes registry source and label binding');
 const action=await session.invoke('invoke_action',{name:'demo.step',args:3});assert.equal(action.state,'completed');assert.equal(action.result.ok,true);
 await until(()=>values(session,'demo.clicks'),count=>count===countBefore+10,'action did not execute');
 check(true,'local invoke_action obtains completed receipt and changes real source');
 const saved=await session.invoke('save_project',{project,revision:original.revision,refresh:true});check(saved.saved&&saved.displayUpdatedBySave,'real save and explicit composition refresh completed');
 status=await session.invoke('get_project_status',{});view=canvasView(status);check(view.selected==='canvas'&&view.pageInstance>0,'refresh preserves selected nested canvas rather than resetting to raster');
 native=await inspect(session,view.pageInstance);assert.equal(native.nodes.find(node=>node.id==='direct_step').radius,12);
 const stale=await session.tools.call('save_project',{project,revision:original.revision});check(stale.isError===true,'obsolete revision is rejected without overwriting saved project');
 assert.equal((await session.invoke('read_project',{})).revision,saved.revision);
 const subtree=await session.invoke('read_project_document',{kind:'screens',name:'canvas',node:'direct_step'});check(subtree.document.id==='direct_step'&&subtree.document.events[0].action==='demo.step','selective read returns the authored subtree and event');
 const schemeAction=await session.invoke('get_data_catalog',{kind:'actions',name:'ui.select_scheme',detail:true});
 check(schemeAction.items[0]?.description?.includes('theme.<id>.<role>'),'target advertises project scheme authoring: '+JSON.stringify(schemeAction));
 const badArgs=await session.tools.call('invoke_action',{name:'ui.select_scheme',args:'{"literal":"trial"}'});
 check(badArgs.isError===true,'an event expression is rejected as an action value');
 const schemeClick=await session.invoke('send_event',{node:'direct_theme',event:'clicked',instance:view.pageInstance});
 assert.equal(schemeClick.result.ok,true);
 await until(()=>values(session,'ui.scheme'),scheme=>scheme.id==='trial','project scheme did not activate');
 native=await inspect(session,view.pageInstance);
 check(native.nodes.find(node=>node.id==='direct_theme').background===0x3850a4,'authored scheme role changes real LVGL button color');
 project.styles['theme.trial.button'].props.bg_color='#557799';
 const updated=await session.invoke('write_project_document',{kind:'styles',name:'theme.trial.button',document:project.styles['theme.trial.button'],revision:saved.revision,refresh:true});
 assert.equal(updated.saved,true);
 const reselect=await session.invoke('invoke_action',{name:'ui.select_scheme',args:'trial'});
 assert.equal(reselect.result.ok,true);
 view=canvasView(await session.invoke('get_project_status',{}));
 native=await inspect(session,view.pageInstance);
 check(native.nodes.find(node=>node.id==='direct_theme').background===0x557799,'reselect applies updated role to current LVGL composition');
 const persisted=await session.invoke('read_project',{});assert.deepEqual(persisted.project,decodeProject(encodeProject(project,session.connected.capabilities),session.connected.capabilities));assert.equal(session.stderr,'');assert.equal(await session.stop(),0);
 session=await launch();const reopened=await session.invoke('read_project',{});check(reopened.revision===persisted.revision&&JSON.stringify(reopened.project)===JSON.stringify(persisted.project),'restart with the same store restores exact authored JSON and revision');
 await session.invoke('send_event',{node:'go_canvas',event:'clicked'});status=await session.invoke('get_project_status',{});view=canvasView(status);native=await inspect(session,view.pageInstance);
 check(native.nodes.find(node=>node.id==='direct_step').radius===12,'restored saved project executes in real LVGL after restart');
 const afterRestart=await session.invoke('send_event',{node:'direct_theme',event:'clicked',instance:view.pageInstance});
 assert.equal(afterRestart.result.ok,true);
 await until(()=>values(session,'ui.scheme'),scheme=>scheme.id==='trial','saved scheme missing after restart');
 native=await inspect(session,view.pageInstance);
 check(native.nodes.find(node=>node.id==='direct_theme').background===0x557799,'saved project scheme is selectable after native restart');
 check(report.requests.every(request=>request.path.startsWith('/api/')),'all local tools use existing native API paths, never an MCP endpoint');
 report.localTools=tools.map(tool=>tool.name);report.savedRevision=persisted.revision;report.compiler='existing shared JSON/CBOR codecs';report.framePng='not tested: WebView canvas is tested by the MAUI application';report.nativeMcpRequired=false;report.hiddenNoOsInput=true;
 assert.equal(session.stderr,'');assert.equal(await session.stop(),0);
}catch(error){failures++;report.error=error.stack??String(error);throw error;}
finally{
 await Promise.allSettled([...sessions].map(session=>session.stop()));
 await mkdir(output,{recursive:true});report.ok=failures===0;await writeFile(join(output,'measurements.json'),JSON.stringify(report,null,2));
 const inside=relative(resolve(tmpdir()),resolve(temporary));assert.ok(inside.startsWith('nacborui-designer-direct-')&&!isAbsolute(inside)&&dirname(resolve(temporary))===resolve(tmpdir()));await rm(temporary,{recursive:true,force:true});
}
console.log('PASS: Designer local JS tools -> real hidden NaWServer/LVGL with MCP disabled: catalog, authored styles, nested navigation/event/binding, receipts, preview/save/refresh, revision conflict and durable restart');
