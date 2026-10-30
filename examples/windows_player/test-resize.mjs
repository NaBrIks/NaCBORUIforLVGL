import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadProject} from './loader.mjs';
import {adaptSystemPage} from './system-page.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
const {stdout}=await promisify(execFile)(exe,['--capabilities'],{windowsHide:true,maxBuffer:2*1024*1024});
const capabilities=JSON.parse(stdout);
const project=adaptSystemPage(JSON.parse(await readFile(join(here,'demo.json'),'utf8')),capabilities);
const child=spawn(process.execPath,[join(here,'run.mjs'),'--exe',exe,'--control','--hidden','--no-settings'],
  {cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let stderr='',next=0,closed=false;const pending=new Map();
let startResolve,startReject;const started=new Promise((yes,no)=>{startResolve=yes;startReject=no;});
const startup=setTimeout(()=>startReject(Error('Resize startup timeout '+stderr)),15000);
child.stderr.on('data',s=>stderr+=s);
createInterface({input:child.stdout}).on('line',line=>{
  let e;try{e=JSON.parse(line);}catch{return;}
  if(e.event==='loaded'){clearTimeout(startup);startResolve();}
  if(e.event==='fatal'){clearTimeout(startup);startReject(Error(e.error));}
  if(e.event==='result'&&pending.has(e.id)){const p=pending.get(e.id);pending.delete(e.id);clearTimeout(p.timer);p.yes(e);}
});
const exit=new Promise(yes=>child.once('close',code=>{closed=true;yes(code);}));
const wait=ms=>new Promise(yes=>setTimeout(yes,ms));
function command(request) {
  const id=++next;return new Promise((yes,no)=>{
    const timer=setTimeout(()=>{pending.delete(id);no(Error('Resize command timeout '+JSON.stringify(request)+' '+stderr));},10000);
    pending.set(id,{yes,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');
  });
}
const source=(r,name)=>JSON.parse(r.dataJson).sources.find(s=>s.name===name)?.value;
function healthy(r) {
  assert.equal(r.ok,true,r.error);assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);
  assert.equal(JSON.parse(r.dataJson).diagnostics.bindingErrors,0);assert.equal(r.resizable,true);
}
async function settle(width,height) {
  const deadline=Date.now()+5000;let r;
  do {await wait(30);r=await command({op:'inspect'});healthy(r);
    if(r.displayWidth===width&&r.displayHeight===height)return r;
  }while(Date.now()<deadline);
  assert.fail('Viewport did not converge: '+JSON.stringify({width,height,actual:[r.displayWidth,r.displayHeight]}));
}
const ids=node=>[node.id,...node.children.flatMap(ids)];
const temporary=await mkdtemp(join(tmpdir(),'nacborui-resize-'));
try {
  await started;await wait(2200);let r=await settle(800,480);
  await command({op:'write',source:'demo.level',value:67});
  await command({op:'write',source:'demo.text',value:'Resize'});
  const sequence=source(r,'system.cpu').sequence;
  const output=join(root,'local/windows-resize');await mkdir(output,{recursive:true});
  const measurements=[];
  for(const [width,height] of [[800,480],[1200,800],[1600,900],[1024,768],[800,480]]) {
    const previous=r.views[0].pageInstance;
    r=await command({op:'resize',width,height});healthy(r);r=await settle(width,height);
    assert.equal(r.views[0].pageInstance,previous,'resize keeps the current page instance');
    for(const page of ['overview','details','settings','system']) {
      r=await command({op:'click',node:'go_'+(page==='overview'?'overview':page)});healthy(r);
      const instance=r.views[0].pageInstance;
      r=await command({op:'inspect',nodes:ids(project.screens[page].root).map(id=>({id,instance}))});healthy(r);
      assert.equal(source(r,'demo.level'),67);assert.equal(source(r,'demo.text'),'Resize');
      for(const node of r.nodes) {
        assert.ok(node.found,node.id);
        const [x,y,x2,y2]=node.bounds;
        if(Object.hasOwn(node,'text'))assert.ok(y2-y+1>=node.fontHeight,node.id+' must fit a full text line');
        const coreScroll=page==='system'&&source(r,'system.cpu').displayed>32&&node.id.startsWith('core_')&&node.id!=='core_area';
        const gpuScroll=page==='system'&&source(r,'system.gpus').length>2&&
          ((node.id.startsWith('gpu_')&&!['gpu_list','gpu_group','gpu_heading'].includes(node.id))||/^gpumem_(item|name)_/.test(node.id));
        if(!coreScroll&&!gpuScroll)assert.ok(x>=0&&y>=28&&x2<width&&y2<height-44,`${width}x${height}/${page}/${node.id}: ${node.bounds}`);
        if(node.parentBounds&&!(coreScroll&&node.id==='core_grid')&&!(gpuScroll&&/^gpu_group_\d+$|^gpumem_item_\d+$/.test(node.id))){const [a,b,c,d]=node.parentBounds;
          assert.ok(x>=a&&y>=b&&x2<=c&&y2<=d,`${page}/${node.id} must fit parent: ${node.bounds} / ${node.parentBounds}`);}
      }
      assert.deepEqual(r.nodes[0].bounds,[0,28,width-1,height-45]);
      assert.ok(r.nodes[0].scrollBottom<=0&&r.nodes[0].scrollRight<=0,'page root has no hidden overflow');
      if(page==='system') {
        const block=id=>r.nodes.find(n=>n.id===id).bounds;
        const cpu=block('cpu_group'),lower=['ram_group','gpu_group','gpumem_group'].map(block);
        assert.ok(cpu[3]<lower[0][1]);
        for(const b of lower){assert.equal(b[1],lower[0][1]);assert.equal(b[3],lower[0][3]);assert.ok(Math.abs((b[2]-b[0])-(lower[0][2]-lower[0][0]))<=1);}
        for(let i=1;i<lower.length;i++)assert.ok(lower[i-1][2]<lower[i][0]);
      }
      const shell=await command({op:'inspect',nodes:['status','content','go_overview','go_details','go_system','go_settings'].map(id=>({id}))});healthy(shell);
      assert.deepEqual(shell.nodes[0].bounds,[0,0,width-1,27]);
      assert.deepEqual(shell.nodes[1].bounds,[0,28,width-1,height-45]);
      const buttons=shell.nodes.slice(2);
      assert.equal(buttons[0].bounds[0],0);assert.equal(buttons.at(-1).bounds[2],width-1);
      buttons.forEach((b,i)=>{assert.equal(b.bounds[1],height-44);assert.equal(b.bounds[3],height-1);if(i)assert.equal(b.bounds[0],buttons[i-1].bounds[2]+1);});
      assert.equal((await command({op:'snapshot',path:join(output,`${width}x${height}-${page}.bmp`)})).ok,true);
      measurements.push({width,height,page,instance,nodes:r.nodes});
    }
  }
  // Reload declared 800x480 CBOR into a different current viewport; no window or sampler restart.
  await command({op:'resize',width:1200,height:800});r=await settle(1200,800);
  const packet=await loadProject(join(here,'demo.json'),capabilities,{prepare:adaptSystemPage});
  const file=join(temporary,'project.cbor');await writeFile(file,packet.bytes);
  r=await command({op:'load',path:file,entry:'shell'});healthy(r);
  assert.deepEqual([r.displayWidth,r.displayHeight],[1200,800]);
  assert.ok(source(r,'system.cpu').sequence>sequence);
  r=await command({op:'inspect',nodes:[{id:'root'}]});healthy(r);assert.deepEqual(r.nodes[0].bounds,[0,0,1199,799]);
  // A rejected resize preserves page, viewport, geometry and active data.
  const before=r.views[0].pageInstance;
  assert.equal((await command({op:'resize',width:200,height:100})).ok,false);
  r=await command({op:'inspect',nodes:[{id:'root'}]});healthy(r);
  assert.equal(r.views[0].pageInstance,before);assert.deepEqual(r.nodes[0].bounds,[0,0,1199,799]);
  await writeFile(join(output,'measurements.json'),JSON.stringify(measurements,null,2));
  child.stdin.end('{"op":"quit"}\n');assert.equal(await exit,0);
  console.log('PASS: actual hidden Win32 client resize, five sizes, all four pages, full-width shell, parent bounds, no scroll/clipping, stable instance, histories, CBOR reload in resized viewport, rejected resize and shutdown');
}finally{
  clearTimeout(startup);for(const p of pending.values())clearTimeout(p.timer);
  if(!closed){child.stdin.end();await Promise.race([exit,wait(3000).then(()=>child.kill())]);}
  await rm(temporary,{recursive:true,force:true});
}
