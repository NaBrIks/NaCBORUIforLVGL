// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {systemPage} from './system-page.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
const {stdout}=await promisify(execFile)(exe,['--capabilities'],{windowsHide:true,maxBuffer:2*1024*1024});
const capabilities=JSON.parse(stdout);
const topologySize=name=>capabilities.binding.sources.find(source=>source.name===name).schema.maxItems;
const child=spawn(process.execPath,[join(here,'run.mjs'),'--exe',exe,'--control','--hidden','--no-settings'],
  {cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let stderr='',next=0,closed=false;const pending=new Map();
let loadedResolve,loadedReject;const loaded=new Promise((yes,no)=>{loadedResolve=yes;loadedReject=no;});
const startup=setTimeout(()=>loadedReject(Error('System player startup timeout '+stderr)),15000);
child.stderr.on('data',s=>stderr+=s);
createInterface({input:child.stdout}).on('line',line=>{
  let e;try{e=JSON.parse(line);}catch{return;}
  if(e.event==='loaded'){clearTimeout(startup);loadedResolve(e);}
  if(e.event==='fatal'){clearTimeout(startup);loadedReject(Error(e.error));}
  if(e.event==='result'&&pending.has(e.id)){const p=pending.get(e.id);pending.delete(e.id);clearTimeout(p.timer);p.yes(e);}
});
const exit=new Promise(yes=>child.once('close',code=>{closed=true;yes(code);}));
const wait=ms=>new Promise(yes=>setTimeout(yes,ms));
function command(request) {
  const id=++next;
  return new Promise((yes,no)=>{
    const timer=setTimeout(()=>{pending.delete(id);no(Error('System command timeout '+JSON.stringify(request)+' '+stderr));},10000);
    pending.set(id,{yes,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');
  });
}
const data=result=>JSON.parse(result.dataJson);
const source=(result,name)=>{const s=data(result).sources.find(s=>s.name===name);assert.equal(s.state,'known',name);return s.value;};
function healthy(result) {
  assert.equal(result.ok,true);assert.equal(result.windowVisible,false);assert.equal(result.foreground,false);
  assert.equal(data(result).diagnostics.bindingErrors,0);assert.equal(data(result).diagnostics.queueDropped,0);
}
try {
  await loaded;await wait(3500);
  let r=await command({op:'inspect'});healthy(r);assert.equal(r.views[0].selected,'system');
  const cpu=source(r,'system.cpu'),cores=source(r,'system.cores'),ram=source(r,'system.memory'),gpus=source(r,'system.gpus');
  assert.ok(cpu.percent>=0&&cpu.percent<=100);assert.equal(cores.length,cpu.displayed);
  assert.equal(cores.length,Math.min(cpu.count,64));
  assert.equal(cores.length,topologySize('system.cores'),'CPU slots come from the actual registry topology');
  assert.equal(gpus.length,topologySize('system.gpus'),'GPU slots come from DXGI discovery, not authored placeholders');assert.ok(cores.every(c=>c.history.length===32&&c.history.at(-1)>=0));
  assert.ok(ram.usedMiB>0&&ram.totalMiB>=ram.usedMiB);
  assert.ok(Math.abs(ram.usedMiB+ram.availableMiB-ram.totalMiB)<0.01);
  assert.ok(Math.abs(ram.percent-100*ram.usedMiB/ram.totalMiB)<0.001);
  for(const gpu of gpus) {
    assert.ok(gpu.name);assert.equal(gpu.series.history.length,32);
    if(!Object.hasOwn(gpu,'percent'))assert.equal(gpu.series.history.at(-1),-1,'missing GPU counters remain gaps');
    if(process.argv.includes('--require-gpu')) {
      assert.ok(gpu.percent>=0&&gpu.percent<=100,gpu.name+' load counter');
      assert.ok(gpu.dedicatedMiB>=0&&gpu.sharedMiB>=0,gpu.name+' memory counters');
    }
  }
  if(process.argv.includes('--require-gpu'))assert.ok(gpus.length>0);
  // Sampling and history belong to the application, independent of the demo generator/page.
  await command({op:'write',source:'demo.running',value:false});
  await command({op:'click',node:'go_settings'});await wait(2200);
  r=await command({op:'inspect'});healthy(r);assert.ok(source(r,'system.cpu').sequence>cpu.sequence);
  assert.ok(source(r,'system.cpu').series.history.filter(n=>n>=0).length>cpu.series.history.filter(n=>n>=0).length);
  await command({op:'click',node:'go_system'});r=await command({op:'inspect'});healthy(r);
  // Fill the actual bounded history; no fabricated samples in visual acceptance.
  const deadline=Date.now()+38000;
  while(source(r,'system.cpu').series.history.includes(-1)&&Date.now()<deadline) {
    await wait(1000);r=await command({op:'inspect'});healthy(r);
  }
  assert.ok(source(r,'system.cpu').series.history.every(n=>n>=0));
  const instance=r.views[0].pageInstance;
  const topology=new Map();
  function collect(node,parent=null,scrollAncestor=false) {
    const scrollable=node.flags?.SCROLLABLE===true;
    topology.set(node.id,{parent,scrollable,scrollAncestor});
    for(const child of node.children)collect(child,node.id,scrollAncestor||scrollable);
  }
  collect(systemPage(cores.length,gpus.length).root);
  const inspect=()=>command({op:'inspect',nodes:[...topology.keys()].map(id=>({id,instance}))});
  r=await inspect();healthy(r);
  for(let i=0;i<gpus.length;i++)assert.equal(r.nodes.find(node=>node.id==='gpu_name_'+i).text,gpus[i].name);
  const bounds=r.nodes.map(n=>n.bounds),byId=new Map(r.nodes.map(n=>[n.id,n]));
  // Extra CPU/GPU rows belong to explicit nested scroll views, never to page overflow.
  for(const n of r.nodes) {
    assert.ok(n.found,n.id);
    const expected=topology.get(n.id),[x,y,x2,y2]=n.bounds;
    assert.ok(x2>=x&&y2>=y,n.id+' has nonempty geometry');
    assert.ok(x>=0&&x2<r.displayWidth,n.id+' stays inside content horizontally');
    if(!expected.scrollAncestor)assert.ok(y>=28&&y2<r.displayHeight-44,n.id+' stays inside content');
    if(expected.scrollable||!expected.parent)assert.ok(n.scrollRight<=0,n.id+' has no horizontal overflow');
    if(!expected.parent){assert.ok(n.scrollBottom<=0,'page root has no hidden overflow');continue;}
    const parent=byId.get(expected.parent),[a,b,c,d]=parent.bounds;
    assert.deepEqual(n.parentBounds,parent.bounds,n.id+' has the expected parent geometry');
    assert.ok(x>=a&&x2<=c,n.id+' fits parent horizontally');
    assert.ok(y>=b,n.id+' starts inside its parent');
    if(topology.get(expected.parent).scrollable) {
      if(y2>d)assert.ok(parent.scrollBottom>0,expected.parent+' owns vertical overflow of '+n.id);
    } else assert.ok(y2<=d,n.id+' fits its non-scrolling parent');
  }
  const palettes=JSON.parse(await readFile(join(here,'schemes.json'),'utf8')).schemes;
  const output=join(root,'local/windows-system');await mkdir(output,{recursive:true});
  for(const [id,palette] of Object.entries(palettes)) {
    await command({op:'scheme',scheme:id});r=await inspect();healthy(r);
    assert.equal(r.views[0].pageInstance,instance);
    assert.deepEqual(r.nodes.map(n=>n.bounds),bounds);
    for(const node of r.nodes.filter(n=>n.id.endsWith('_history')||/^core_\d+$/.test(n.id)))
      assert.equal(node.indicatorLineColor,parseInt(palette.primary.slice(1),16),node.id+' plot palette');
    assert.equal((await command({op:'snapshot',path:join(output,id+'.bmp')})).ok,true);
  }
  await writeFile(join(output,'acceptance.json'),JSON.stringify(r,null,2));
  const maximum=cores.map((c,i)=>({label:String(i).padStart(2,'0')+'  100.0%',history:Array(32).fill(100)}));
  r=await command({op:'publish',source:'system.cores',value:maximum});healthy(r);
  assert.equal((await command({op:'snapshot',path:join(output,'maximum.bmp')})).ok,true);
  r=await inspect();assert.deepEqual(r.nodes.map(n=>n.bounds),bounds);
  // An unavailable sample has a gap and keeps geometry; publishing does not write hardware.
  const unavailable=cores.map((c,i)=>({label:'CPU '+String(i).padStart(2,'0')+'  —',history:Array(32).fill(-1)}));
  r=await command({op:'publish',source:'system.cores',value:unavailable});healthy(r);
  assert.equal((await command({op:'snapshot',path:join(output,'unavailable.bmp')})).ok,true);
  r=await inspect();assert.deepEqual(r.nodes.map(n=>n.bounds),bounds);
  r=await command({op:'publish',source:'system.cores',value:unavailable.map((c,i)=>i?c:{...c,history:[101,...c.history.slice(1)]})});
  assert.equal(r.ok,false);
  r=await inspect();healthy(r);assert.deepEqual(r.nodes.map(n=>n.bounds),bounds);
  await command({op:'write',source:'demo.running',value:true});
  child.stdin.end('{"op":"quit"}\n');assert.equal(await exit,0);
  console.log(`PASS: real Windows CPU (${cpu.count} logical processors / ${cores.length} shown), RAM, ${gpus.length} GPUs, CBOR ingress, 32-sample histories off page, four live palettes, bounds, missing samples, rejected values, hidden UI and shutdown`);
} finally {
  clearTimeout(startup);for(const p of pending.values())clearTimeout(p.timer);
  if(!closed){child.stdin.end();await Promise.race([exit,wait(3000).then(()=>child.kill())]);}
}
