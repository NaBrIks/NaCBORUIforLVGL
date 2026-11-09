// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??'local/catalog-player/Release/nacborui_player.exe');
const project=JSON.parse(await readFile(join(here,'graphics-gallery.json'),'utf8'));
assert.deepEqual(Object.keys(project.screens).sort(),['canvas','controller','raster','settings','shell','vector']);
const require=createRequire(new URL('../../integrations/mcp/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-graphics-'));
const child=spawn(process.execPath,[join(here,'run.mjs'),join(here,'graphics-gallery.json'),'--profile','graphics','--exe',exe,'--api-port','0','--api-store',join(temporary,'store'),'--assistant-store',join(temporary,'assistant.json'),'--control','--hidden','--no-settings','--scheme','dark'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let stderr='',next=0,closed=false,loaded=false,url,mcp;const pending=new Map();
let readyResolve,readyReject;const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});
const startup=setTimeout(()=>readyReject(Error('Gallery startup timeout '+stderr)),20000);
child.stderr.on('data',s=>stderr+=s);
createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line);}catch{return;}
 if(e.event==='loaded')loaded=true;
 if(e.event==='api_ready')url=e.url;
 if(loaded&&url){clearTimeout(startup);readyResolve();}
 if(e.event==='fatal'||e.event==='error'){clearTimeout(startup);readyReject(Error(e.error));}
 if(e.event==='result'&&pending.has(e.id)){const p=pending.get(e.id);pending.delete(e.id);clearTimeout(p.timer);p.resolve(e);}
});
const exit=new Promise(resolve=>child.once('close',code=>{closed=true;readyReject(Error('Gallery exited '+code+' '+stderr));resolve(code);}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function command(request){const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Gallery command timeout '+JSON.stringify(request)+' '+stderr));},10000);pending.set(id,{resolve,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});}
function healthy(r){assert.equal(r.ok,true,r.error);assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);const d=JSON.parse(r.dataJson).diagnostics;assert.equal(d.bindingErrors,0);assert.equal(d.queueDropped,0);}
function bitmap(bytes){const w=bytes.readInt32LE(18),rawH=bytes.readInt32LE(22),h=Math.abs(rawH),offset=bytes.readUInt32LE(10),stride=w*4;assert.equal(bytes.readUInt16LE(28),32);return {w,h,pixel(x,y){const p=offset+(rawH<0?y:h-1-y)*stride+x*4;return bytes.readUInt32LE(p)&0xffffff;}};}
function colors(image,bounds){const out=new Set();for(let y=bounds[1]+1;y<bounds[3];y++)for(let x=bounds[0]+1;x<bounds[2];x++)out.add(image.pixel(x,y));return out;}
const collect=node=>[node,...(node.children??[]).flatMap(collect)];
let call;
async function event(node,instance){const r=await call('send_event',{node,event:'clicked',...(instance?{instance}:{})});assert.equal(r.state,'completed');assert.equal(r.result.ok,true,JSON.stringify(r));return r;}
async function page(name){await event('go_'+name);await wait(100);const r=await command({op:'inspect'});healthy(r);assert.equal(r.views[0].selected,name);const instance=r.views[0].pageInstance;assert.ok(instance>0);return {instance,inspect:()=>command({op:'inspect',nodes:collect(project.screens[name].root).map(n=>({id:n.id,instance}))})};}
const output=join(root,'local/windows-graphics-gallery');
try {
 await ready;
 mcp=new Client({name:'windows-graphics-gallery-test',version:'1.0.0'});
 await mcp.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'integrations/mcp/index.js')],cwd:root,env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:url,LVGL_CBOR_ALLOW_PREVIEW:'1',LVGL_CBOR_ALLOW_SAVE:'1',LVGL_CBOR_ALLOW_DATA:'1'},stderr:'pipe'}));
 call=async(name,args={})=>{const r=await mcp.callTool({name,arguments:args},undefined,{timeout:20000});assert.equal(r.isError,undefined,JSON.stringify(r.content));return JSON.parse(r.content[0].text);};
 const groups=await call('get_data_catalog');assert.ok(!groups.items.some(g=>g.name==='host.cpu'||g.name==='host.gpu'),'graphics has no task-manager groups');
 const cpu=await call('get_data_catalog',{kind:'sources',prefix:'host.cpu'});assert.equal(cpu.items.length,0);
 await mkdir(output,{recursive:true});
 const measurements=[],pageResults={},checkerColors=[];
 let gifChanged=0,binDifferences=0;
 for(const name of ['raster','vector']){
  const p=await page(name);await wait(200);let r=await p.inspect();healthy(r);
  for(const n of r.nodes){assert.ok(n.found,n.id);if(n.id!=='root'){const [x,y,x2,y2]=n.bounds,[a,b,c,d]=n.parentBounds;assert.ok(x>=a&&y>=b&&x2<=c&&y2<=d,n.id+' fits parent '+n.bounds+' / '+n.parentBounds);assert.ok(x>=0&&y>=48&&x2<r.displayWidth&&y2<r.displayHeight-44,n.id+' visible');}}
  assert.ok(r.nodes.find(n=>n.id==='root').scrollBottom<=0,name+' needs no scroll at its designed size');
  const byId=new Map(r.nodes.map(n=>[n.id,n]));
  if(name==='vector'){const initial=byId.get('value').text;await wait(350);r=await p.inspect();healthy(r);assert.notEqual(r.nodes.find(n=>n.id==='value').text,initial,'live code source drives vector page binding');}
  await call('write_source',{source:'demo.running',value:false});await wait(90);
  const path=join(output,name+'-dark.bmp');assert.equal((await command({op:'snapshot',path})).ok,true);const a=bitmap(await readFile(path));
  for(const n of r.nodes.filter(n=>n.id.startsWith('image_')||n.id.startsWith('sample_'))){const count=colors(a,n.bounds).size;assert.ok(count>=(n.id==='sample_gif'?4:8),n.id+' has decoded pixels '+count);measurements.push({page:name,id:n.id,bounds:n.bounds,colors:count});const check=byId.get('checker_'+n.id.replace(/^(image_|sample_)/,''));const c=[a.pixel(check.bounds[0]+2,check.bounds[1]+2),a.pixel(check.bounds[0]+10,check.bounds[1]+2)];assert.notEqual(c[0],c[1],'visible checkerboard: '+n.id);checkerColors.push({id:n.id,colors:c});}
  if(name==='raster'){
   const gif=byId.get('sample_gif').bounds;await wait(360);const second=join(output,'gif-next.bmp');assert.equal((await command({op:'snapshot',path:second})).ok,true);const b=bitmap(await readFile(second));
   for(let y=gif[1];y<=gif[3];y++)for(let x=gif[0];x<=gif[2];x++)if(a.pixel(x,y)!==b.pixel(x,y))gifChanged++;assert.ok(gifChanged>100,'GIF advances with generator paused');
   const raw=byId.get('image_rgb565').bounds,bin=byId.get('image_bin').bounds;
   for(let y=0;y<=raw[3]-raw[1];y++)for(let x=0;x<=raw[2]-raw[0];x++)if(a.pixel(raw[0]+x,raw[1]+y)!==a.pixel(bin[0]+x,bin[1]+y))binDifferences++;
   assert.equal(binDifferences,0,'real BIN matches raw RGB565');
   for(const id of ['rgb565','rgb888','xrgb8888','i4','bin','jpeg','bmp']){
    const image=byId.get('image_'+id),check=byId.get('checker_'+id),dx=image.bounds[0]-check.bounds[0]+1,dy=image.bounds[1]-check.bounds[1]+1;
    const parity=((Math.floor(dx/8)+Math.floor(dy/8))&1),underlay=checkerColors.find(x=>x.id==='image_'+id).colors[parity];
    assert.notEqual(a.pixel(image.bounds[0]+1,image.bounds[1]+1),underlay,id+' opaque source hides shared checker');
   }
   for(const id of ['argb8888','png','a8']){
    const image=byId.get('image_'+id),check=byId.get('checker_'+id),dx=image.bounds[0]-check.bounds[0]+1,dy=image.bounds[1]-check.bounds[1]+1;
    const parity=((Math.floor(dx/8)+Math.floor(dy/8))&1),expected=checkerColors.find(x=>x.id==='image_'+id).colors[parity];
    assert.equal(a.pixel(image.bounds[0]+1,image.bounds[1]+1),expected,id+' transparent corner shows shared checker');
   }
  }
  const labels=r.nodes.filter(n=>n.id.endsWith('_title')||n.id.endsWith('_detail'));
  for(const scheme of ['light','cream','emerald','dark']){healthy(await command({op:'scheme',scheme}));await wait(80);healthy(await p.inspect());const shot=join(output,name+'-'+scheme+'.bmp');assert.equal((await command({op:'snapshot',path:shot})).ok,true);const pixels=bitmap(await readFile(shot));for(const n of labels)assert.ok(colors(pixels,n.bounds).size>1,scheme+'/'+n.id+' visible caption');}
  pageResults[name]={instance:p.instance,nodes:r.nodes.length,noScroll:true};
  await call('write_source',{source:'demo.running',value:true});
 }
 assert.ok(checkerColors.every(x=>x.colors.join(',')===checkerColors[0].colors.join(',')),'same checkerboard behind all 19 samples');
 let p=await page('controller'),r=await p.inspect();healthy(r);assert.ok(r.nodes.every(n=>n.found));
 for(const n of r.nodes){const [x,y,x2,y2]=n.bounds,[a,b,c,d]=n.parentBounds;if(n.id!=='root')assert.ok(x>=a&&y>=b&&x2<=c&&y2<=d,n.id+' controller fits parent');}
 await event('controller_reset',p.instance);await event('controller_step',p.instance);await event('controller_step10',p.instance);await event('controller_stop',p.instance);await wait(100);r=await p.inspect();healthy(r);assert.equal(r.nodes.find(n=>n.id==='controller_count').text,'Нажатия: 11');assert.equal((await call('get_data',{name:'demo.running'})).items[0].value,false);
 await event('controller_start',p.instance);await wait(100);r=await p.inspect();healthy(r);assert.equal((await call('get_data',{name:'demo.running'})).items[0].value,true);assert.ok(r.nodes.find(n=>n.id==='controller_start').state&4,'START checked follows the source');
 const arrows=r.nodes.filter(n=>n.id.endsWith('_arrow'));assert.equal(arrows.length,4);for(const n of arrows)assert.ok(n.state&512,n.id+' decorative polygon is disabled and skipped by LVGL focus traversal');
 for(const scheme of ['light','cream','emerald','dark']){healthy(await command({op:'scheme',scheme}));await wait(70);const path=join(output,'controller-'+scheme+'.bmp');assert.equal((await command({op:'snapshot',path})).ok,true);const shot=bitmap(await readFile(path));for(const n of arrows){const color=shot.pixel(Math.round((n.bounds[0]+n.bounds[2])/2),Math.round((n.bounds[1]+n.bounds[3])/2));assert.ok([color>>16,(color>>8)&255,color&255].every(c=>Math.abs(c-27)<=2),scheme+'/'+n.id+' geometry is visible independently of fonts');}}

 const polygonCatalog=await call('get_device',{section:'widgets',name:'ui:polygon_button'});assert.equal(polygonCatalog.items[0].name,'ui:polygon_button');
 const input=async(x,y,pressed)=>{const response=await fetch(new URL('/api/view/input',url),{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode({x:Math.round(x),y:Math.round(y),pressed}),signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.equal((await response.json()).ok,true);};
 const touch=async(x,y)=>{await input(x,y,true);await input(x,y,false);await wait(60);};
 const counter=async()=>(await call('get_data',{name:'demo.clicks'})).items[0].value;
 const origin=r.nodes.find(n=>n.id==='controller_step').bounds,center=[(origin[0]+origin[2])/2,(origin[1]+origin[3])/2];
 await event('controller_reset',p.instance);await wait(50);assert.equal(await counter(),0);
 for(const [dx,dy] of [[-150,-150],[150,-150],[-150,150],[150,150],[72,0]])await touch(center[0]+dx,center[1]+dy);
 assert.equal(await counter(),0,'exterior corners and inner gap never click the sector rectangles');
 await input(center[0],center[1]-112,true);r=await p.inspect();healthy(r);assert.ok(r.nodes.find(n=>n.id==='controller_step').state&128,'HTTP pointer drives normal LVGL PRESSED state');
 assert.equal((await command({op:'snapshot',path:join(output,'controller-pressed.bmp')})).ok,true);
 await input(center[0],center[1]-112,false);await wait(60);assert.equal(await counter(),1,'HTTP pointer inside the up polygon invokes the generic event');
 await touch(center[0]+112,center[1]);assert.equal(await counter(),11,'right sector routes through its ordinary +10 action');
 const reshape=structuredClone((await call('read_project')).project),find=(n,id)=>n.id===id?n:(n.children??[]).map(c=>find(c,id)).find(Boolean);
 const changedButton=find(reshape.screens.controller.root,'controller_step');changedButton.props.points=[[0,0],[300,0],[0,300]];changedButton.children[0].style.x=-120;changedButton.children[0].style.y=-120;changedButton.common={add_state:16};changedButton.styleRules=[{part:'MAIN',state:['FOCUS_KEY'],props:{outline_width:3,outline_color:'#ffcc00',outline_opa:255}}];
 await call('preview_project',{project:reshape,screen:'shell'});await event('go_controller');await wait(80);
 r=await command({op:'inspect'});const reshapedInstance=r.views[0].pageInstance;
 await touch(center[0],center[1]-112);assert.equal(await counter(),11,'old sector interior is no longer clickable after an MCP-only path change');
 await touch(center[0]-140,center[1]-140);assert.equal(await counter(),12,'new triangle interior is clickable without rebuilding');
 await event('controller_step',reshapedInstance);await wait(50);assert.equal(await counter(),13,'same node/action still executes via MCP send_event');
 const focusInspect=await command({op:'inspect',nodes:[{id:'controller_step',instance:reshapedInstance}]});healthy(focusInspect);assert.equal(focusInspect.nodes[0].outlineWidth,3);
 const focusShot=join(output,'controller-mcp-triangle.bmp');assert.equal((await command({op:'snapshot',path:focusShot})).ok,true);const focused=bitmap(await readFile(focusShot));let outlinePixels=0;for(let y=origin[1];y<=origin[3];y++)for(let x=origin[0];x<=origin[2];x++){const color=focused.pixel(x,y);if((color>>16)>=252&&Math.abs(((color>>8)&255)-204)<=3&&(color&255)<=3)outlinePixels++};assert.ok(outlinePixels>50,'MCP-authored FOCUS_KEY outline follows the polygon');
 // Restore the Project scene and counter for the remaining independent page tests.
 await call('preview_project',{project,screen:'shell'});await event('go_controller');r=await command({op:'inspect'});await event('controller_reset',r.views[0].pageInstance);await event('controller_step',r.views[0].pageInstance);await event('controller_step10',r.views[0].pageInstance);await wait(50);
 pageResults.controller={instance:p.instance,events:'reset/+1/+10/STOP/OK',counter:11,httpPointer:true,exteriorPointsRejected:5,pressedState:true,geometricArrows:4,arrowSchemes:4,decorativeArrowsSkipFocus:true,mcpReshape:{oldInteriorRejected:true,newTriangleInteriorClicked:true,sameAction:true},focusOutlinePixels:outlinePixels};
 p=await page('settings');r=await p.inspect();healthy(r);for(const n of r.nodes)assert.ok(n.found,n.id);
 for(const scheme of ['light','cream','emerald','dark']){await event('scheme_'+scheme,p.instance);await wait(80);r=await p.inspect();healthy(r);assert.match(r.nodes.find(n=>n.id==='current_scheme').text,/Текущая:/);}
 const secret=r.nodes.find(n=>n.id==='assistant_key');assert.ok(secret);assert.equal(secret.text,'[redacted]','password native inspect is redacted');
 assert.equal((await command({op:'snapshot',path:join(output,'settings-dark.bmp')})).ok,true);pageResults.settings={nodes:r.nodes.length,schemes:4};
 p=await page('canvas');r=await p.inspect();healthy(r);assert.equal(r.nodes.length,1,'initial MCP canvas has only its empty root');
 // Author on the blank page through the existing MCP/ProjectService, then execute its normal event.
 const authored=structuredClone((await call('read_project')).project);
 authored.screens.canvas.root.children.push({id:'agent_step',type:'button',props:{text:'MCP +7'},style:{width:140,height:38},styles:[{ref:'global-static:ui.button'}],events:[{event:'clicked',action:'demo.step',args:{literal:7}}]},
 {id:'agent_result',type:'label',props:{text:'—'},style:{width:220,height:24},styles:[{ref:'global-static:ui.text'}],bindings:[{method:'text',value:{source:'demo.clicks'},format:{prefix:'Счётчик: '}}]});
 await call('preview_project',{project:authored,screen:'shell'});await event('go_canvas');r=await command({op:'inspect'});healthy(r);const agentInstance=r.views[0].pageInstance;await event('agent_step',agentInstance);await wait(100);
 r=await command({op:'inspect',nodes:[{id:'agent_result',instance:agentInstance}]});healthy(r);assert.equal(r.nodes[0].text,'Счётчик: 18');assert.equal((await call('read_project')).project.screens.canvas.root.children.length,0,'MCP preview did not save canvas changes');pageResults.canvas={empty:true,agentAuthoredViaMcp:true,counter:18};
 assert.equal((await command({op:'snapshot',path:join(output,'canvas-mcp-authored.bmp')})).ok,true);
 await writeFile(join(output,'acceptance.json'),JSON.stringify({measurements,checkerColors,pageResults,gifChangedPixels:gifChanged,binDifferences,realMcp:true,stderr},null,2));
 await mcp.close();mcp=null;child.stdin.end('{"op":"quit"}\n');assert.equal(await exit,0);
 console.log('PASS: graphics-only five-page Project, 19 real LVGL samples, identical checkerboards and alpha, true BIN, independent GIF, ordinary controller events through MCP, four schemes, empty canvas authored through MCP and hidden shutdown');
} finally {clearTimeout(startup);for(const p of pending.values())clearTimeout(p.timer);await mcp?.close().catch(()=>{});if(!closed){child.stdin.end();await Promise.race([exit,wait(3000).then(()=>child.kill())]);}await rm(temporary,{recursive:true,force:true});}
