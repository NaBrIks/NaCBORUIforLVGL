// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {DataClient,createProject} from '../../packages/project-codec/index.js';
import {createBlankScreen} from '../../frontend/src/screen-model.js';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
const require=createRequire(new URL('../../integrations/mcp/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-native-view-')),output=join(root,'local/windows-native-view');
const child=spawn(process.execPath,[join(here,'run.mjs'),'--profile','graphics','--exe',exe,'--api-port','0','--api-store',join(temporary,'project'),'--control','--hidden','--no-settings'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let next=0,stderr='',apiUrl,loaded=false,closed=false,readyResolve,readyReject,mcp;
const pending=new Map(),ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;}),wait=ms=>new Promise(yes=>setTimeout(yes,ms));
const startup=setTimeout(()=>readyReject(Error('Native viewer startup timeout '+stderr)),15000);
child.stderr.on('data',chunk=>stderr+=chunk);
createInterface({input:child.stdout}).on('line',line=>{
 let event;try{event=JSON.parse(line);}catch{return;}
 if(event.event==='api_ready')apiUrl=event.url;if(event.event==='loaded')loaded=true;
 if(event.event==='fatal'||event.event==='error')readyReject(Error(event.error+' '+stderr));
 if(apiUrl&&loaded){clearTimeout(startup);readyResolve();}
 if(event.id!==undefined&&pending.has(event.id)){const job=pending.get(event.id);pending.delete(event.id);clearTimeout(job.timer);job.resolve(event);}
});
const exit=new Promise(yes=>child.once('close',code=>{closed=true;clearTimeout(startup);readyReject(Error('Player exited '+code+' '+stderr));for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Player exited'));}pending.clear();yes(code);}));
function command(request){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native command timeout '+stderr));},6000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});}
async function inspect(){const result=await command({op:'inspect',nodes:[{id:'remote_button'},{id:'counter'}]});assert.equal(result.ok,true,result.error);assert.equal(result.windowVisible,false);assert.equal(result.foreground,false);const d=JSON.parse(result.dataJson).diagnostics;assert.equal(d.bindingErrors,0);assert.equal(d.queueDropped,0);return result;}
async function frame(name){const response=await fetch(new URL('/api/view/frame',apiUrl),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.status!==200)assert.fail('Frame HTTP '+response.status+': '+await response.text());assert.match(response.headers.get('content-type'),/image\/bmp/);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.toString('ascii',0,2),'BM');const width=bytes.readInt32LE(18),height=-bytes.readInt32LE(22);assert.ok(width>0&&height>0&&width*height<=2097152);assert.equal(bytes.length,54+width*height*4);await writeFile(join(output,name+'.bmp'),bytes);return {width,height,bytes};}
async function pointer(x,y,pressed,status=200){const response=await fetch(new URL('/api/view/input',apiUrl),{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode({x,y,pressed}),signal:AbortSignal.timeout(5000)});assert.equal(response.status,status);if(status===200)assert.equal((await response.json()).ok,true);}
async function until(test,message){const deadline=Date.now()+4000;let result;do{result=await inspect();if(test(result))return result;await wait(30);}while(Date.now()<deadline);assert.fail(message);}
const counter=result=>JSON.parse(result.dataJson).sources.find(item=>item.name==='demo.clicks').value;
try{
 await ready;await mkdir(output,{recursive:true});const info=await (await fetch(new URL('/api/info',apiUrl))).json();assert.equal(info.profile,'graphics');assert.equal(info.native_view,true);assert.equal(info.server,'NaWServer');
 assert.equal((await fetch(new URL('/viewer',apiUrl))).status,200);assert.equal((await fetch(new URL('/editor/',apiUrl))).status,200);
 const initial=await frame('graphics');const caps=await (await fetch(new URL('/api/capabilities',apiUrl))).json();
 assert.ok(!caps.binding.sources.some(item=>item.name.startsWith('assistant.')));assert.ok(!caps.binding.actions.some(item=>item.name.startsWith('assistant.')));
 assert.equal((await command({op:'protect_secret',text:'unsupported'})).ok,false);
 assert.equal((await command({op:'unprotect_secret',text:'unsupported'})).ok,false);
 mcp=new Client({name:'native-view-test',version:'1.0.0'});await mcp.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'integrations/mcp/index.js')],cwd:root,env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:apiUrl,LVGL_CBOR_ALLOW_PREVIEW:'1',LVGL_CBOR_ALLOW_DATA:'1'},stderr:'pipe'}));
 const call=async(name,args={})=>{const response=await mcp.callTool({name,arguments:args},undefined,{timeout:20000});assert.equal(response.isError,undefined,JSON.stringify(response.content));return JSON.parse(response.content[0].text);};
 const screen=createBlankScreen('viewer_test','Viewer input');screen.size={width:initial.width,height:initial.height};screen.root.flags={SCROLLABLE:false};screen.root.style={width:initial.width,height:initial.height,pad_all:0,border_width:0,radius:0,bg_color:'#f4ede0',bg_opa:255,text_font:'ui_20'};
 screen.root.children=[{id:'remote_button',type:'button',props:{text:'Pointer'},style:{x:20,y:20,width:180,height:52},events:[{event:'clicked',action:'demo.step',args:{literal:2}}]},{id:'counter',type:'label',style:{x:20,y:84,width:240,height:32},props:{text:'--'},bindings:[{method:'text',value:{source:'demo.clicks'},format:{prefix:'Clicks: '}}]}];
 assert.equal((await call('preview_project',{project:createProject([screen]),screen:'viewer_test'})).saved,false);
 let state=await inspect();const button=state.nodes.find(node=>node.id==='remote_button');assert.equal(button.found,true);const [x1,y1,x2,y2]=button.bounds,x=Math.floor((x1+x2)/2),y=Math.floor((y1+y2)/2),before=await frame('before');assert.equal(before.bytes.readUInt32LE(54)&0xffffff,0xf4ede0);
 await pointer(-1,0,true,400);await pointer(initial.width,0,true,400);assert.equal(counter(await inspect()),0);
 await pointer(x,y,true);await wait(40);await pointer(x,y,false);
 state=await until(result=>counter(result)===2,'HTTP pointer did not execute the real LVGL hit-test/click/binding');assert.equal(state.nodes.find(node=>node.id==='counter').text,'Clicks: 2');
 const after=await frame('after');assert.notDeepEqual(before.bytes,after.bytes,'native frame pixels follow the live binding');
 const event=await call('send_event',{node:'remote_button',event:'clicked'});assert.equal(event.state,'completed');assert.equal(event.result.ok,true);await until(result=>counter(result)===4,'MCP event did not reach the same runtime');
 await pointer(x,y,true);await until(result=>counter(result)===6,'500 ms pointer release watchdog did not release the held button');
 assert.equal((await command({op:'resize',width:2048,height:1152})).ok,true);await wait(80);const oversized=await fetch(new URL('/api/view/frame',apiUrl));assert.equal(oversized.status,413);assert.match(await oversized.text(),/pixel_limit/);
 assert.equal((await command({op:'resize',width:initial.width,height:initial.height})).ok,true);await wait(80);await frame('restored');
 await writeFile(join(output,'measurements.json'),JSON.stringify({server:'NaWServer',profile:'graphics',width:initial.width,height:initial.height,pointerClick:2,mcpEvent:4,watchdogRelease:6,framePixelLimit:2097152,oversizedFrameStatus:413,noAgentRegistry:true,noSecretOperations:true,providerRequests:false,executableSha256:createHash('sha256').update(await readFile(exe)).digest('hex')},null,2));
 await mcp.close();mcp=null;child.stdin.end('{"op":"quit"}\n');assert.equal(await exit,0);
 console.log('PASS: graphics native NaWServer viewer/frame BMP, real independent pointer hit-testing and binding pixels, MCP event, 500 ms release watchdog, bounded frame rejection/recovery, absent agent registry/secret operations; no provider requests or OS input');
}finally{
 clearTimeout(startup);await mcp?.close().catch(()=>{});for(const job of pending.values())clearTimeout(job.timer);
 if(!closed){child.stdin.end('{"op":"quit"}\n');await Promise.race([exit,wait(3000).then(()=>child.kill())]);}
 await rm(temporary,{recursive:true,force:true});
}
