// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {serializeDocument} from '../../packages/document-io/index.js';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createProject} from '../../packages/project-codec/index.js';
import {createBlankScreen} from '../../frontend/src/screen-model.js';
import {screenContract} from '../../packages/screen-codec/index.js';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const expectHistoryOff=process.argv.includes('--expect-history-off');
const exe=resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))??join(root,'local/windows-player/Release/nacborui_player.exe'));
import {connectNativeApi} from './native-api.mjs';
const folder=await mkdtemp(join(tmpdir(),'nacborui-catalog-'));
const palettes=JSON.parse(await readFile(join(here,'registry-schemes.json'),'utf8'));
palettes.schemes.by_agent={...palettes.schemes.classic,name:'Авторская из файла',roleOverrides:{button:{radius:11,border_width:2},panel:{radius:11,border_width:1}}};
const customSchemes=join(folder,'custom-schemes.json');await writeFile(customSchemes,JSON.stringify(palettes));
const child=spawn(process.execPath,[join(here,'run.mjs'),'--exe',exe,'--control','--hidden','--no-settings','--schemes',customSchemes,'--scheme','classic','--api-port','0','--api-store',join(folder,'store')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let next=0,closed=false,stderr='',loadedResolve,loadedReject,apiResolve,apiReject;const pending=new Map(),loads=new Map();
const loaded=new Promise((yes,no)=>{loadedResolve=yes;loadedReject=no;});
const apiReady=new Promise((yes,no)=>{apiResolve=yes;apiReject=no;});
const startup=setTimeout(()=>{const error=Error('Catalog player startup timeout '+stderr);loadedReject(error);apiReject(error);},15000);
child.stderr.on('data',chunk=>stderr+=chunk);
createInterface({input:child.stdout}).on('line',line=>{
 let event;try{event=JSON.parse(line);}catch{return;}
 if(event.event==='loaded'){clearTimeout(startup);loadedResolve(event);const waiting=loads.get(event.path);if(waiting){loads.delete(event.path);clearTimeout(waiting.timer);waiting.yes(event);}}
 if(event.event==='api_ready')apiResolve(event.url);
 if(event.event==='error'){for(const waiting of loads.values()){clearTimeout(waiting.timer);waiting.no(Error(event.error));}loads.clear();}
 if(event.event==='fatal'){clearTimeout(startup);loadedReject(Error(event.error));apiReject(Error(event.error));}
 if(event.id!==undefined&&pending.has(event.id)){const p=pending.get(event.id);pending.delete(event.id);clearTimeout(p.timer);p.yes(event);}
});
const exit=new Promise(yes=>child.once('close',code=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('Player exited '+code+' '+stderr));}pending.clear();yes(code);}));
const wait=ms=>new Promise(yes=>setTimeout(yes,ms));
function command(request){const id=++next;return new Promise((yes,no)=>{const timer=setTimeout(()=>{pending.delete(id);no(Error('Catalog command timeout '+JSON.stringify(request)+' '+stderr));},6000);pending.set(id,{yes,no,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});}
function open(path){return new Promise((yes,no)=>{const timer=setTimeout(()=>{loads.delete(path);no(Error('Generated JSON load timeout'));},6000);loads.set(path,{yes,no,timer});child.stdin.write(JSON.stringify({op:'open',path})+'\n');});}
const snapshotData=r=>JSON.parse(r.dataJson),entry=(r,name)=>snapshotData(r).sources.find(item=>item.name===name);
const rgb=hex=>parseInt(hex.slice(1),16);
function healthy(r){assert.equal(r.ok,true,r.error);assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);assert.equal(snapshotData(r).diagnostics.bindingErrors,0);assert.equal(snapshotData(r).diagnostics.queueDropped,0);}
async function until(predicate,message,timeout=3000){const end=Date.now()+timeout;let result;do{await wait(50);result=await command({op:'inspect'});healthy(result);if(predicate(result))return result;}while(Date.now()<end);assert.fail(message);}
function region(bytes,[x1,y1,x2,y2]){
 assert.equal(bytes.toString('ascii',0,2),'BM');const width=bytes.readInt32LE(18),rawHeight=bytes.readInt32LE(22),height=Math.abs(rawHeight),bits=bytes.readUInt16LE(28),offset=bytes.readUInt32LE(10);
 assert.ok(bits===24||bits===32);assert.ok(x1>=0&&y1>=0&&x2<width&&y2<height);const stride=Math.ceil(width*bits/32)*4,parts=[];
 for(let y=y1;y<=y2;y++){const row=rawHeight<0?y:height-y-1,start=offset+row*stride+x1*bits/8;parts.push(bytes.subarray(start,start+(x2-x1+1)*bits/8));}
 return Buffer.concat(parts);
}
const output=join(root,'local/windows-catalog',expectHistoryOff?'history-off':'history-on');
let api;const themeMeasurements=[];
const deadline=setTimeout(()=>{const error=Error('Catalog end-to-end deadline (30 seconds)');loadedReject(error);for(const p of pending.values())p.no(error);for(const p of loads.values())p.no(error);child.stdin.end();},30000);
try{
 const [,apiUrl]=await Promise.all([loaded,apiReady]);let state=await command({op:'inspect'});healthy(state);
 assert.equal(state.historyAvailable,!expectHistoryOff);assert.equal(state.historyAllocatedPoints,expectHistoryOff?0:32);
 if(!expectHistoryOff){
  state=await until(r=>entry(r,'demo.level_history')?.state==='known','History did not sample');
  const initialHistory=entry(state,'demo.level_history').value;assert.equal(initialHistory.history.length,32);assert.equal(initialHistory.periodMs,200);assert.ok(initialHistory.history.some(value=>value===null),'unused startup points remain unknown');
 }
 const api=await connectNativeApi(apiUrl);
 const nativeCaps=await command({op:'capabilities'});assert.equal(nativeCaps.ok,true,nativeCaps.error);const capabilities=JSON.parse(nativeCaps.capabilitiesJson);
 assert.ok(capabilities.availableWidgets.length>0);
 const groups=await api.catalog();assert.ok(groups.items.some(g=>g.name==='demo'));
 const first=await api.catalog({kind:'sources',group:'demo',limit:2,maxBytes:512});assert.ok(first.items.length>0&&first.items.length<=2);assert.equal(first.hasMore,true);
 const names=first.items.map(item=>item.name);let page=first;
 while(page.hasMore){page=await api.catalog({kind:'sources',group:'demo',offset:page.nextOffset,catalogRevision:first.catalogRevision,limit:2,maxBytes:512});names.push(...page.items.map(item=>item.name));assert.ok(names.length<=32);}
 assert.equal(names.length,first.total);assert.equal(new Set(names).size,names.length);assert.ok(names.includes('demo.level'));
 const fields=await api.catalog({kind:'fields',name:'demo.speed'});assert.equal(fields.items.find(item=>item.field==='kmh').unit,'km/h');
 const value=await api.values({name:'demo.speed',path:'/kmh'});assert.equal(value.items[0].state,'known');assert.equal(typeof value.items[0].value,'number');
 assert.equal((await command({op:'add_demo_sensor',name:'demo.dynamic_temperature'})).ok,true);
 await assert.rejects(()=>api.catalog({kind:'sources',group:'demo',catalogRevision:first.catalogRevision}),error=>error.status===409);
 const dynamic=await api.catalog({kind:'sources',name:'demo.dynamic_temperature',detail:true});assert.equal(dynamic.items[0].schema.unit,'C');assert.match(dynamic.items[0].schema.description,/dynamic sensor/i);assert.ok(dynamic.catalogRevision>first.catalogRevision);
 assert.equal((await api.values({name:'demo.dynamic_temperature'})).items[0].value,23.5);
 await mkdir(output,{recursive:true});
 if(expectHistoryOff){
  assert.equal(entry(state,'demo.level_history'),undefined);assert.equal(entry(state,'demo.history_enabled'),undefined);
  const absent=await api.catalog({kind:'sources',prefix:'demo.level_history'});assert.equal(absent.total,0);
 }else{
  const metadata=await api.catalog({kind:'sources',name:'demo.level_history',detail:true});assert.equal(metadata.items[0].schema.fields.history.items.nullable,true);
 }
 const shipped=JSON.parse(await readFile(join(here,'registry-demo.json'),'utf8'));
 const shell=createBlankScreen('shell','Catalog-generated shell'),historyPage=expectHistoryOff?createBlankScreen('history','History'):structuredClone(shipped.screens.registry_demo),blank=createBlankScreen('blank','Blank');
 historyPage.id='history';
 if(!expectHistoryOff)historyPage.root.children.find(node=>node.id==='choices').children.find(node=>node.id==='choose_space').common={add_state:screenContract.states.FOCUSED};
 shell.root.style={width:800,height:480,pad_all:0,border_width:0,text_font:'ui_20'};shell.root.styles=[{ref:'global-static:ui.canvas'}];
 const pageRoot={width:800,height:430,pad_all:0,border_width:0,bg_color:'#101820',bg_opa:255,text_color:'#eeeeee'};
 historyPage.size.height=430;historyPage.root.style=expectHistoryOff?{...pageRoot}:{...historyPage.root.style,width:800,height:430};blank.size.height=430;blank.root.style={...pageRoot};
 shell.root.children=[{id:'content',type:'obj',style:{x:0,y:0,width:800,height:430,pad_all:0,border_width:0},view:{pages:[{screen:'history',retention:'retain'},{screen:'blank',retention:'retain'}],initial:'history',sizing:'fill'},children:[]},
  ...['history','blank'].map((screen,index)=>({id:'go_'+screen,type:'button',style:{x:400*index,y:435,width:395,height:40,text_font:'ui_14'},styles:[{ref:'global-static:ui.button'},{ref:'global-static:ui.button_pressed',state:['CHECKED']}],props:{text:screen},events:[{event:'clicked',navigate:{view:'content',screen}}]}))];
 if(expectHistoryOff)historyPage.root.children=[{id:'level',type:'slider',style:{x:15,y:375,width:500,height:25},props:{min:0,max:100},bindings:[{method:'value',value:{source:'demo.level'}}],events:[{event:'value_changed',write:{source:'demo.level'},value:{event:'value'}}]}];
 blank.root.children=[{id:'caption',type:'label',props:{text:'Sampling continues outside the history page'},style:{x:15,y:15,width:760,height:30}}];
 const project=createProject([shell,historyPage,blank]);
 await api.validate({kind:'project',document:project});const packet=join(folder,'generated.cbor');await writeFile(packet,serializeDocument('project',project,'cbor',{capabilities}));
 const json=join(folder,'generated.json');await writeFile(json,JSON.stringify(project));
 // Both authoring JSON and CBOR take the existing loader/common codec path.
 await open(json);
 state=await command({op:'load',path:packet,entry:'shell'});healthy(state);let instance=state.views[0].pageInstance;
 state=await command({op:'inspect',nodes:[{id:'level',instance},...(!expectHistoryOff?[{id:'plot',instance},{id:'mean',instance}]:[])]});healthy(state);assert.ok(state.nodes.every(node=>node.found));
 if(!expectHistoryOff){
  const ids=['root','plot','choose_classic','choose_space','choose_pony','heading','mean','level','history_enabled','sampling_label'];
  for(const scheme of ['classic','space','pony']){
   const palette=palettes.schemes[scheme];state=await command({op:'click',node:'choose_'+scheme,instance});healthy(state);assert.equal(state.views[0].pageInstance,instance,'changing appearance preserves page ownership');assert.equal(entry(state,'ui.scheme').value.id,scheme);
   state=await command({op:'inspect',nodes:ids.map(id=>({id,instance}))});healthy(state);
   const node=id=>state.nodes.find(item=>item.id===id);assert.equal(node('root').background,rgb(palette.canvas));assert.equal(node('plot').background,rgb(palette.surface));assert.equal(node('plot').indicatorLineColor,rgb(palette.roleOverrides?.indicator?.line_color??palette.primary));assert.equal(node('mean').foreground,rgb(palette.text));
   assert.equal(node('choose_classic').radius,palette.roleOverrides.button.radius);assert.equal(node('choose_classic').borderWidth,palette.roleOverrides.button.border_width??0);
   assert.equal(node('choose_space').outlineWidth,3,'later screen style wins over same-selector ui.button_focus width1');assert.equal(node('choose_space').outlinePad,2);
   for(const option of ['classic','space','pony'])assert.equal(Boolean(node('choose_'+option).state&screenContract.states.CHECKED),option===scheme);
   for(const n of state.nodes){assert.ok(n.found);if(n.parentBounds){const [x,y,x2,y2]=n.bounds,[a,b,c,d]=n.parentBounds;assert.ok(x>=a&&y>=b&&x2<=c&&y2<=d,n.id+' fits its parent');}}
   themeMeasurements.push({scheme,instance,nodes:state.nodes});
   assert.equal((await command({op:'snapshot',path:join(output,scheme+'.bmp')})).ok,true);
  }
  // This id is not a built-in preset. It was authored in the custom --schemes file.
  assert.equal((await command({op:'invoke',action:'ui.select_scheme',value:'by_agent'})).ok,true);
  state=await command({op:'inspect',nodes:[{id:'choose_classic',instance}]});healthy(state);assert.equal(entry(state,'ui.scheme').value.id,'by_agent');assert.equal(state.nodes[0].radius,11);assert.equal(state.nodes[0].borderWidth,2);
  themeMeasurements.push({scheme:'by_agent',instance,nodes:state.nodes});
  assert.equal((await command({op:'snapshot',path:join(output,'custom-file-scheme.bmp')})).ok,true);
  assert.equal((await command({op:'click',node:'choose_classic',instance})).ok,true);
 }
 const beforeFile=join(output,'before.bmp');assert.equal((await command({op:'snapshot',path:beforeFile})).ok,true);
 const oldMean=expectHistoryOff?null:entry(state,'demo.level_history').value.mean;
 assert.equal((await command({op:'write',source:'demo.level',value:25})).ok,true);
 state=expectHistoryOff?await command({op:'inspect'}):await until(r=>entry(r,'demo.level_history')?.value.history.at(-1)===25,'History did not capture updated level');healthy(state);
 state=await command({op:'inspect',nodes:[{id:'level',instance},...(!expectHistoryOff?[{id:'plot',instance},{id:'mean',instance}]:[])]});healthy(state);assert.equal(state.nodes[0].value,25);
 const afterFile=join(output,'after.bmp');assert.equal((await command({op:'snapshot',path:afterFile})).ok,true);
 if(!expectHistoryOff){
  const sampled=entry(state,'demo.level_history').value,known=sampled.history.filter(v=>v!==null);assert.ok(sampled.mean<oldMean);assert.ok(Math.abs(sampled.mean-known.reduce((a,b)=>a+b,0)/known.length)<1e-9);assert.equal(state.nodes[2].text,'Mean: '+sampled.mean.toFixed(2));
  assert.notDeepEqual(region(await readFile(beforeFile),state.nodes[1].bounds),region(await readFile(afterFile),state.nodes[1].bounds),'Real LVGL history pixels must change');
  const time=sampled.timeMs;state=await command({op:'click',node:'go_blank'});healthy(state);assert.equal(state.views[0].selected,'blank');
  await until(r=>entry(r,'demo.level_history').value.timeMs>time,'Sampling stopped outside page');
  state=await command({op:'click',node:'go_history'});healthy(state);assert.equal(state.views[0].pageInstance,instance);
  assert.equal((await command({op:'event',node:'history_enabled',instance,event:'pressed'})).ok,true);
  state=await command({op:'event',node:'history_enabled',instance,event:'released'});healthy(state);assert.equal(state.historyAllocatedPoints,0);assert.equal(state.historyEnabled,false);assert.equal(entry(state,'demo.level_history').state,'unknown');
  const disabledRevision=entry(state,'demo.level_history').revision;await command({op:'write',source:'demo.level',value:90});await wait(450);
  state=await command({op:'inspect'});healthy(state);assert.equal(state.historyAllocatedPoints,0);assert.equal(entry(state,'demo.level_history').revision,disabledRevision);
  assert.equal((await command({op:'event',node:'history_enabled',instance,event:'pressed'})).ok,true);
  assert.equal((await command({op:'event',node:'history_enabled',instance,event:'released'})).ok,true);
  state=await until(r=>entry(r,'demo.level_history')?.state==='known'&&entry(r,'demo.level_history').value.history.slice(-2).every(v=>v===90),'History did not restart with two visible points');assert.equal(state.historyAllocatedPoints,32);assert.ok(entry(state,'demo.level_history').value.history.filter(v=>v!==null).every(v=>v===90));
  // A new agent-authored design is ordinary project content, delivered through
  // the existing HTTP API preview transfer and native ProjectService/style executor.
  const custom=structuredClone(shipped);custom.manifest.name='HTTP API author design';
  const customHeading=custom.screens.registry_demo.root.children.find(node=>node.id==='heading');delete customHeading.bindings;customHeading.props.text='Авторская схема / создана через HTTP API';
  const authored={canvas:{bg_color:'#21102d',text_color:'#fbe9ff'},panel:{bg_color:'#32133e',border_color:'#995caa',text_color:'#fbe9ff',radius:12,border_width:2},text:{text_color:'#fbe9ff'},button:{bg_color:'#6b2785',text_color:'#ffffff',radius:10,border_width:2,border_color:'#f5a3db'},active:{bg_color:'#4f1767',text_color:'#ffffff',outline_color:'#ff93d5',outline_width:1},indicator:{bg_color:'#ff93d5',border_color:'#ff93d5',line_color:'#ff93d5'},track:{bg_color:'#673a77',border_color:'#995caa',radius:10},knob:{bg_color:'#ffe3f7',border_color:'#f5a3db',radius:10}};
  for(const [name,props] of Object.entries(authored))custom.styles['agent.'+name]={scope:'global',name:'agent.'+name,attach:false,props};
  function author(node){
   node.styles=(node.styles??[]).flatMap(style=>{
    const role=style.ref.startsWith('global-static:ui.')?style.ref.slice('global-static:ui.'.length):null;
    if(role==='button_pressed'||role==='button_focus')return [{...style,ref:'global-dynamic:agent.active'}];
    return role&&Object.hasOwn(authored,role)?[style,{...style,ref:'global-dynamic:agent.'+role}]:[style];
   });for(const child of node.children??[])author(child);
  }
  author(custom.screens.registry_demo.root);
  const invalid=structuredClone(custom);invalid.styles['agent.button'].props.made_up_property=1;
  const old=await command({op:'inspect',nodes:[{id:'root',instance},{id:'choose_pony',instance}]});healthy(old);const savedBeforePreview=await api.read();
  await assert.rejects(()=>api.preview({project:invalid,screen:'registry_demo'}));
  const unchanged=await command({op:'inspect',nodes:[{id:'root',instance},{id:'choose_pony',instance}]});healthy(unchanged);assert.deepEqual(unchanged.nodes,old.nodes);
  const preview=await api.preview({project:custom,screen:'registry_demo'});assert.equal(preview.saved,false);
  state=await command({op:'inspect',nodes:[{id:'root'},{id:'choose_pony'},{id:'plot'},{id:'mean'}]});healthy(state);assert.equal(state.nodes[0].background,rgb('#21102d'));assert.equal(state.nodes[1].background,rgb('#6b2785'));assert.equal(state.nodes[1].radius,10);assert.equal(state.nodes[2].indicatorLineColor,rgb('#ff93d5'));assert.equal(state.nodes[3].foreground,rgb('#fbe9ff'));
  themeMeasurements.push({scheme:'api-authored-design',projectStyleNames:Object.keys(custom.styles),nodes:state.nodes});
  assert.equal((await command({op:'snapshot',path:join(output,'api-authored-design.bmp')})).ok,true);
  const saved=await api.read();assert.equal(saved.revision,savedBeforePreview.revision);assert.equal(saved.project.styles['agent.button'],undefined,'preview does not overwrite the saved project');
 }
 await writeFile(join(output,'measurements.json'),JSON.stringify({server:'NaWServer',historyAvailable:state.historyAvailable,historyAllocatedPoints:state.historyAllocatedPoints,catalogRevision:dynamic.catalogRevision,sources:names,themes:themeMeasurements},null,2));

 child.stdin.end('{"op":"quit"}\n');assert.equal(await exit,0);
 console.log(`PASS: native Windows LVGL -> NaWServer -> direct HTTP API; grouped selective catalog paging, byte budget, dynamic metadata/revision conflict, generated JSON/CBOR project; history ${expectHistoryOff?'compiled out, zero allocation':'sampling, real plot pixels, mean, off-page accumulation and disable/free/restart; three preset designs, stacked styles and selector priority, caller-defined scheme, agent project.styles via HTTP API preview and rejected invalid style preserving UI'}`);
}finally{
 clearTimeout(startup);clearTimeout(deadline);
 for(const p of pending.values())clearTimeout(p.timer);for(const p of loads.values())clearTimeout(p.timer);
 if(!closed){child.stdin.end();await Promise.race([exit,wait(3000).then(()=>child.kill())]);}
 await rm(folder,{recursive:true,force:true});
}
