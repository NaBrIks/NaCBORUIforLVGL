// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createProject} from '../../packages/project-codec/index.js';
import {createBlankScreen} from '../../frontend/src/screen-model.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
import {connectNativeApi} from './native-api.mjs';
const temporary=await mkdtemp(join(tmpdir(),'nacborui-layout-debug-')),output=join(root,'local/windows-layout-debug');
await mkdir(output,{recursive:true});
const main=createBlankScreen('main','Layout depth');main.size={width:800,height:480};
main.root.style={bg_color:'#fbfaf6',bg_opa:255,pad_all:0,border_width:0,text_font:'ui_20'};
const node=(type,id,style,children=[],props={})=>({id,type,style,children,props,flags:{SCROLLABLE:false}});
main.root.children=[node('label','title',{x:20,y:16,text_color:'#222222'},[],{text:'8 x 8 tiles / 5 x 6 digits / actual tree depth'}),
 node('obj','panel',{x:20,y:60,width:360,height:360,pad_all:16,border_width:0,bg_color:'#e8eee9',bg_opa:255},[
  node('obj','inner',{width:320,height:270,pad_all:16,border_width:0,bg_color:'#d5dfe5',bg_opa:255,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_row:12},[
   node('label','caption',{text_color:'#222222'},[],{text:'Nested components'}),
   node('button','button',{width:240,height:64,bg_color:'#223344',bg_opa:255,text_color:'#ffffff'},[],{text:'A normal LVGL button'})])]),
 node('obj','content',{x:400,y:60,width:380,height:360,pad_all:8,border_width:0,bg_color:'#ece5d7',bg_opa:255})];
main.root.children[2].view={pages:[{screen:'child',retention:'cache'}],initial:'child'};
const nested=createBlankScreen('child','Mounted page');nested.size={width:350,height:320};
nested.root.style={bg_color:'#f0ece2',bg_opa:255,border_width:0,pad_all:16};
nested.root.children=[node('label','nested_label',{text_color:'#222222'},[],{text:'A mounted page: depth continues'}),
 node('obj','nested_box',{y:80,width:280,height:180,bg_color:'#293944',bg_opa:255,border_width:0,pad_all:12},[
 node('label','nested_inner',{text_color:'#ffffff'},[],{text:'Same native style path'})])];
const fixture=join(temporary,'depth.json');await writeFile(fixture,JSON.stringify(createProject([main,nested],{id:'layout-debug',name:'Depth digits'})));
const child=spawn(process.execPath,[join(here,'run.mjs'),fixture,'--profile','graphics','--exe',exe,'--api-port','0','--api-store',join(temporary,'project'),'--control','--hidden','--no-settings'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let next=0,stderr='',apiUrl,loaded=false,closed=false,readyResolve,readyReject;
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

async function frame(name){
 const response=await fetch(new URL('/api/view/frame',apiUrl),{signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(bytes.toString('ascii',0,2),'BM');await writeFile(join(output,name+'.bmp'),bytes);return bytes;
}
async function inspect(){
 const result=await command({op:'inspect',nodes:['root','panel','inner','button','content'].map(id=>({id}))});
 assert.equal(result.ok,true,result.error);assert.equal(result.windowVisible,false);assert.equal(result.foreground,false);
 const d=JSON.parse(result.dataJson).diagnostics;assert.equal(d.bindingErrors,0);return result;
}
const geometry=r=>r.nodes.map(n=>({id:n.id,bounds:n.bounds,scrollBottom:n.scrollBottom,scrollRight:n.scrollRight}));
const magenta=bytes=>{let n=0;for(let i=54;i<bytes.length;i+=4)if(bytes[i]===255&&bytes[i+1]===0&&bytes[i+2]===255)n++;return n;};
try{
 await ready;const api=await connectNativeApi(apiUrl);
 const info=await(await fetch(new URL('/api/info',apiUrl))).json();assert.equal(info.server,'NaWServer');
 const catalog=await api.catalog({kind:'actions',name:'ui.layout_debug_options',detail:true});
 assert.ok(JSON.stringify(catalog).includes('ui.layout_debug_options'));
 const before=await inspect(),status=await api.status(),original=await frame('normal');
 const levels=Array.from({length:16},()=>({outline:true,digit:true,outlineColor:0xff00ff,digitColor:0xff00ff}));
 const options={opacity:255,outlineWidth:3,layoutType:false,levels};
 const configure=args=>api.invoke({name:'ui.layout_debug_options',args:{...options,...args}});
 await configure({});
 const enabled=await inspect(),debug=await frame('depth-digits');assert.deepEqual(geometry(enabled),geometry(before));
 assert.ok(enabled.nodes.every(n=>n.outlineWidth===3&&n.outlinePad===-3));
 assert.ok(magenta(debug)>1000);assert.ok(magenta(debug)>magenta(original));
 const values=await api.values({name:'ui.layout_debug',detail:true,maxBytes:4096});
 assert.ok(values.items[0].value.maxDepth>=3);
 const typeLevels=levels.map(l=>({...l,outline:false}));
 await configure({levels:typeLevels,layoutType:true});
 const typeFrame=await frame('layout-type');assert.notDeepEqual(typeFrame,debug);
 assert.deepEqual(geometry(await inspect()),geometry(before));
 const typeState=(await api.values({name:'ui.layout_debug',detail:true,maxBytes:4096})).items[0].value;
 assert.equal(typeState.layoutType,true);
 await configure({});
 const selectedLevels=levels.map((l,i)=>({...l,outline:false,digit:i===2,digitColor:0x00ffff,outlineColor:0x00ff00}));
 await configure({levels:selectedLevels,opacity:128});
 const selected=await inspect();assert.deepEqual(geometry(selected),geometry(before));
 assert.deepEqual(selected.nodes.map(n=>n.outlineWidth),before.nodes.map(n=>n.outlineWidth));
 const selectedFrame=await frame('selected-depth-2');assert.notDeepEqual(selectedFrame,original);
 await configure({levels:selectedLevels,opacity:0});assert.deepEqual(await frame('opacity-zero'),original);
 await configure({levels:levels.map(l=>({...l,outline:false,digit:false}))});assert.deepEqual(await frame('no-depths'),original);
 await configure({levels:levels.map(l=>({...l,digit:false,outlineColor:0x00ff00})),outlineWidth:5});
 const outlines=await inspect();assert.ok(outlines.nodes.every(n=>n.outlineWidth===5&&n.outlineColor===0x00ff00));
 await configure({});
 assert.equal((await api.status()).project.revision,status.project.revision);
 await api.refresh();assert.equal((await inspect()).nodes[0].outlineWidth,3);
 await api.invoke({name:'ui.layout_debug',args:false});
 const restored=await inspect(),after=await frame('restored');assert.deepEqual(geometry(restored),geometry(before));
 assert.deepEqual(after,original);assert.equal((await api.status()).project.revision,status.project.revision);
 await writeFile(join(output,'measurements.json'),JSON.stringify({server:info.server,geometryUnchanged:true,pixelsRestored:true,apiAction:true,refreshPreservesDebug:true,maskBytes:320,tile:16,selectedDepths:true,independentModes:true,independentColors:true,outlineWidth:true,opacityZeroRestores:true,magentaPixels:magenta(debug),executableSha256:createHash('sha256').update(await readFile(exe)).digest('hex')},null,2));
 console.log('PASS: HTTP API discovery/action -> NaWServer -> native LVGL A1 16x16 depth digits, independent modes/opacity/depths, unchanged geometry/revision, refresh, exact pixel restoration');
}finally{
 clearTimeout(startup);for(const job of pending.values())clearTimeout(job.timer);
 if(!closed){child.stdin.end('{"op":"quit"}\n');await Promise.race([exit,wait(3000).then(()=>child.kill())]);}
 await rm(temporary,{recursive:true,force:true});
}
