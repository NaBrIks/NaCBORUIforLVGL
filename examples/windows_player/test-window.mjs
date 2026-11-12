// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {encodeProject} from '../../packages/project-codec/index.js';
import {screenContract} from '../../packages/screen-codec/index.js';
import {exampleCapabilities} from './system-page.mjs';
const encodeExample=project=>{
  const capabilities=exampleCapabilities();
  // Deliberate native-resource rejection scenarios must reach the C++ loader.
  capabilities.resources.push({name:'missing_font',type:'const lv_font_t *'});
  return encodeProject(project,capabilities);
};
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const executableArgs=process.argv[2]?['--exe',resolve(process.argv[2])]:[];
const dir=await mkdtemp(join(tmpdir(),'nacborui-window-test-'));
const json=join(dir,'проект with spaces.json'),cbor=join(dir,'project.cbor');
const original=JSON.parse(await readFile(join(here,'demo.json'),'utf8'));
// The shipped demo lands on System; legacy scenarios start on Overview.
original.screens.shell.root.children.find(node=>node.id==='content').view.initial='overview';
await writeFile(json,JSON.stringify(original));await writeFile(cbor,encodeExample(original));
const settings=join(dir,'player-settings.json');
const child=spawn(process.execPath,[join(here,'run.mjs'),json,'--control','--watch','--hidden','--settings',settings,...executableArgs],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
let stderr='',next=0,closed=false,lastRequest;
child.stderr.on('data',bytes=>stderr+=bytes);
const events=[],waiters=[];
function take(predicate,timeout=15000) {
  const index=events.findIndex(predicate);if(index>=0)return Promise.resolve(events.splice(index,1)[0]);
  return new Promise((yes,no)=>{
    const waiter={predicate,yes,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);no(Error('Player wait timeout; last request: '+JSON.stringify(lastRequest)+'; recent events: '+JSON.stringify(events.slice(-4))+'; stderr: '+stderr));},timeout)};
    waiters.push(waiter);
  });
}
createInterface({input:child.stdout}).on('line',line=>{
  let event;try{event=JSON.parse(line);}catch{return;}
  const index=waiters.findIndex(w=>w.predicate(event));
  if(index>=0){const [w]=waiters.splice(index,1);clearTimeout(w.timer);w.yes(event);}else events.push(event);
});
const exit=new Promise(yes=>child.on('close',code=>{closed=true;yes(code);}));
async function command(request){const id=++next;lastRequest=request;child.stdin.write(JSON.stringify({...request,id})+'\n');return take(e=>e.event==='result'&&e.id===id);}
async function open(path){lastRequest={op:'open',path};child.stdin.write(JSON.stringify(lastRequest)+'\n');return take(e=>e.event==='loaded'&&e.path===path);}
const inspect=(instance,...ids)=>command({op:'inspect',nodes:ids.map(id=>({id,instance}))});
const source=(result,name)=>JSON.parse(result.dataJson).sources.find(item=>item.name===name).value;
const color=value=>parseInt(value.slice(1),16);
const checked=node=>Boolean(node.state&screenContract.states.CHECKED);
const event=(instance,node,event,key)=>command({op:'event',instance,node,event,...(key===undefined?{}:{key})});
async function toggle(instance,node) {
  assert.equal((await event(instance,node,'pressed')).ok,true);
  assert.equal((await event(instance,node,'released')).ok,true);
}
try {
  await take(e=>e.event==='loaded');
  let r=await command({op:'inspect'});assert.equal(r.ok,true);assert.equal(r.views[0].selected,'overview');
  assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);
  let instance=r.views[0].pageInstance;
  r=await inspect(instance,'speed','counter','speed_arc');assert.equal(r.nodes[1].text,'Actions: 0');
  assert.match(r.nodes[0].text,/\d+\.\d km\/h/);assert.ok(r.nodes[2].value>=0);
  const first=JSON.parse(r.dataJson);
  await new Promise(yes=>setTimeout(yes,350));
  r=await inspect(instance,'speed');assert.notDeepEqual(JSON.parse(r.dataJson),first);
  r=await command({op:'click',node:'step',instance});assert.equal(r.ok,true);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 1');
  r=await command({op:'click',node:'go_details'});assert.equal(r.views[0].selected,'details');instance=r.views[0].pageInstance;
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 1');
  await command({op:'click',node:'step',instance});
  await command({op:'click',node:'go_overview'});
  r=await command({op:'inspect'});instance=r.views[0].pageInstance;
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 11');
  r=await command({op:'invoke',action:'demo.reset',value:null});assert.equal(r.ok,true);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 0');
  r=await command({op:'publish',source:'demo.clicks',value:12345});assert.equal(r.ok,true);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  r=await command({op:'write',source:'demo.running',value:false});assert.equal(r.ok,true);
  r=await command({op:'publish',source:'demo.speed',value:{kmh:42.5,unit:'km/h',sequence:7}});assert.equal(r.ok,true);
  await new Promise(yes=>setTimeout(yes,100));
  r=await inspect(instance,'speed','speed_arc');assert.equal(r.nodes[0].text,'42.5 km/h');assert.equal(r.nodes[1].value,43);
  const palettes=JSON.parse(await readFile(join(here,'../common/appearance/schemes.json'),'utf8')).schemes;
  const snapshots=join(root,'local/windows-schemes');await mkdir(snapshots,{recursive:true});
  const before=await inspect(instance,'speed','counter','running');
  for(const [id,palette] of Object.entries(palettes)) {
    r=await command({op:'scheme',scheme:id});assert.equal(r.ok,true);assert.equal(r.scheme,id);assert.equal(r.menuScheme,id);
    assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);
    assert.deepEqual(r.schemeMenu.filter(s=>s.checked).map(s=>s.id),[id]);
    assert.equal(r.views[0].pageInstance,instance,'switching schemes preserves instances');
    r=await inspect(instance,'root','speed','counter','running','speed_arc');
    assert.equal(r.nodes[0].background,parseInt(palette.canvas.slice(1),16));
    assert.equal(r.nodes[1].foreground,parseInt(palette.text.slice(1),16));
    assert.equal(r.nodes[4].arcColor,parseInt(palette.primary.slice(1),16));
    assert.equal(r.nodes[3].indicatorOpacity,0,'off switch must keep its neutral track');
    assert.equal(r.nodes[1].text,'42.5 km/h');assert.equal(r.nodes[2].text,'Actions: 12345');
    for(let i=0;i<3;i++)assert.deepEqual(r.nodes[i+1].bounds,before.nodes[i].bounds,'palette keeps geometry');
    r=await command({op:'snapshot',path:join(snapshots,id+'.bmp')});assert.equal(r.ok,true);
    await command({op:'write',source:'demo.running',value:true});
    r=await inspect(instance,'running');assert.ok(checked(r.nodes[0]));
    assert.equal(r.nodes[0].indicatorColor,color(palette.primary),'ON switch follows the palette');
    assert.equal(r.nodes[0].knobColor,color(palette.text));
    await command({op:'write',source:'demo.running',value:false});
    await command({op:'publish',source:'demo.speed',value:{kmh:42.5,unit:'km/h',sequence:7}});
  }
  r=await command({op:'scheme',scheme:'absent'});assert.equal(r.ok,false);
  r=await command({op:'inspect'});assert.equal(r.scheme,'dark');assert.equal(r.menuScheme,'dark');
  await command({op:'click',node:'go_details'});
  r=await command({op:'scheme',scheme:'emerald'});assert.equal(r.views[0].selected,'details');
  const detailsInstance=r.views[0].pageInstance;
  r=await inspect(detailsInstance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  await command({op:'click',node:'go_overview'});
  r=await command({op:'inspect'});assert.equal(r.views[0].pageInstance,instance);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].foreground,parseInt(palettes.emerald.text.slice(1),16));
  // The settings UI is an ordinary composed CBOR page; its buttons invoke registered actions.
  r=await command({op:'click',node:'go_settings'});assert.equal(r.views[0].selected,'settings');
  const settingsInstance=r.views[0].pageInstance;
  const settingsTree=[];
  function collect(node,parent=null){settingsTree.push({id:node.id,parent});for(const child of node.children)collect(child,node.id);}
  collect(original.screens.settings.root);
  for(const [id,palette] of Object.entries(palettes)) {
    r=await command({op:'click',node:'scheme_'+id,instance:settingsInstance});assert.equal(r.ok,true);
    assert.equal(r.scheme,id);assert.equal(r.views[0].pageInstance,settingsInstance);
    const nav=await command({op:'inspect',nodes:[{id:'go_settings'}]});
    assert.ok(nav.nodes[0].state&screenContract.states.CHECKED);
    assert.equal(nav.nodes[0].background,parseInt(palette.hover.slice(1),16));
    assert.deepEqual(r.schemeMenu.filter(s=>s.checked).map(s=>s.id),[id]);
    r=await inspect(settingsInstance,'current_scheme',...Object.keys(palettes).map(n=>'scheme_'+n),'preview_value','preview_count','preview_level');
    assert.equal(r.nodes[0].text,'Текущая: '+palette.name);
    assert.equal(r.nodes[5].text,'42.5 km/h');assert.equal(r.nodes[6].text,'Нажатия: 12345');assert.equal(r.nodes[7].value,43);
    Object.keys(palettes).forEach((name,index)=>assert.equal(Boolean(r.nodes[index+1].state&screenContract.states.CHECKED),name===id));
    Object.keys(palettes).forEach((name,index)=>assert.equal(r.nodes[index+1].background,parseInt((name===id?palette.hover:palette.primary).slice(1),16)));
    await event(settingsInstance,'preview_action','pressed');
    r=await inspect(settingsInstance,'preview_action');assert.equal(r.nodes[0].background,color(palette.hover));
    await event(settingsInstance,'preview_action','released');
    const geometry=await inspect(settingsInstance,...settingsTree.map(node=>node.id));
    const rectangles=new Map(geometry.nodes.map(node=>[node.id,node.bounds]));
    for(const node of settingsTree)if(node.parent) {
      const c=rectangles.get(node.id),p=rectangles.get(node.parent);
      assert.ok(c[0]>=p[0]&&c[1]>=p[1]&&c[2]<=p[2]&&c[3]<=p[3],node.id+' must fit its container');
    }
    assert.equal((await command({op:'snapshot',path:join(snapshots,'settings-'+id+'.bmp')})).ok,true);
    r=await inspect(settingsInstance,'preview_slider','preview_checkbox','preview_line','preview_image');
    assert.equal(r.nodes[0].indicatorColor,color(palette.primary));
    assert.equal(r.nodes[0].knobColor,color(palette.text));
    assert.ok(checked(r.nodes[1]));assert.equal(r.nodes[1].indicatorColor,color(palette.primary));
    assert.equal(r.nodes[2].lineColor,color(palette.primary));assert.equal(r.nodes[3].imageRecolor,color(palette.primary));
    await toggle(settingsInstance,'preview_running');
    r=await inspect(settingsInstance,'preview_running');assert.ok(checked(r.nodes[0]));
    assert.equal(source(r,'demo.running'),true);assert.equal(r.nodes[0].indicatorColor,color(palette.primary));
    await new Promise(yes=>setTimeout(yes,150));
    assert.equal((await command({op:'snapshot',path:join(snapshots,'settings-'+id+'-on.bmp')})).ok,true);
    await toggle(settingsInstance,'preview_running');
    r=await inspect(settingsInstance,'preview_running');assert.equal(checked(r.nodes[0]),false);
    assert.equal(source(r,'demo.running'),false);assert.equal(r.nodes[0].indicatorOpacity,0);
    await command({op:'publish',source:'demo.speed',value:{kmh:42.5,unit:'km/h',sequence:7}});
    await toggle(settingsInstance,'preview_checkbox');
    r=await inspect(settingsInstance,'preview_checkbox');assert.equal(checked(r.nodes[0]),false);assert.equal(source(r,'demo.checked'),false);
    await toggle(settingsInstance,'preview_checkbox');
    r=await inspect(settingsInstance,'preview_checkbox');assert.ok(checked(r.nodes[0]));assert.equal(source(r,'demo.checked'),true);
    assert.equal((await event(settingsInstance,'preview_slider','key','right')).ok,true);
    r=await inspect(settingsInstance,'preview_slider');assert.equal(r.nodes[0].value,66);assert.equal(source(r,'demo.level'),66);
    await command({op:'write',source:'demo.level',value:65});
    assert.equal((await event(settingsInstance,'preview_textarea','focus')).ok,true);
    assert.equal((await event(settingsInstance,'preview_textarea','key',88)).ok,true);
    r=await inspect(settingsInstance,'preview_textarea');assert.equal(r.nodes[0].text,'ТекстX');assert.equal(source(r,'demo.text'),'ТекстX');
    assert.equal(r.nodes[0].cursorBorder,color(palette.primary));
    await event(settingsInstance,'preview_textarea','key','backspace');
    r=await inspect(settingsInstance,'preview_textarea');assert.equal(r.nodes[0].text,'Текст');assert.equal(source(r,'demo.text'),'Текст');
    await event(settingsInstance,'preview_dropdown','key','down');
    r=await inspect(settingsInstance,'preview_dropdown');assert.equal(r.nodes[0].open,true);
    assert.equal(r.nodes[0].listBackground,color(palette.surface));
    const popup=r.nodes[0].listBounds;
    assert.ok(popup[0]>=0&&popup[1]>=28&&popup[2]<800&&popup[3]<436,'dropdown popup fits above the footer');
    assert.equal((await command({op:'snapshot',path:join(snapshots,'settings-'+id+'-popup.bmp')})).ok,true);
    await event(settingsInstance,'preview_dropdown','key','down');
    await event(settingsInstance,'preview_dropdown','key','enter');
    r=await inspect(settingsInstance,'preview_dropdown');assert.equal(r.nodes[0].open,false);
    assert.equal(r.nodes[0].value,1);assert.equal(source(r,'demo.choice'),1);
    await command({op:'write',source:'demo.choice',value:0});
    assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);
  }
  await command({op:'click',node:'preview_action',instance:settingsInstance});
  r=await inspect(settingsInstance,'preview_count');assert.equal(r.nodes[0].text,'Нажатия: 1');
  await command({op:'publish',source:'demo.clicks',value:12345});
  // Dynamic data must stay within its authored cells, including long input/counters.
  const cells=await inspect(settingsInstance,'preview_count','preview_value','preview_textarea');
  await command({op:'publish',source:'demo.clicks',value:Number.MAX_SAFE_INTEGER});
  await command({op:'publish',source:'demo.speed',value:{kmh:180,unit:'km/h',sequence:8}});
  await command({op:'write',source:'demo.text',value:'Ж'.repeat(32)});
  r=await inspect(settingsInstance,'preview_count','preview_value','preview_textarea');
  assert.equal(source(r,'demo.clicks'),Number.MAX_SAFE_INTEGER);
  assert.match(r.nodes[0].text,/^Нажатия: .*\.\.\.$/,'long counter has an explicit ellipsis');
  assert.equal(r.nodes[1].text,'180.0 km/h');assert.equal(r.nodes[2].text,'Ж'.repeat(32));
  r.nodes.forEach((node,i)=>assert.deepEqual(node.bounds,cells.nodes[i].bounds,node.id+' keeps its bounds with long values'));
  assert.equal((await command({op:'snapshot',path:join(snapshots,'settings-long-values.bmp')})).ok,true);
  await command({op:'publish',source:'demo.clicks',value:12345});
  await command({op:'publish',source:'demo.speed',value:{kmh:42.5,unit:'km/h',sequence:9}});
  await command({op:'write',source:'demo.text',value:'Текст'});
  // Native menu/control changes also update the page's bindings.
  await event(settingsInstance,'preview_dropdown','key','down');
  await command({op:'scheme',scheme:'emerald'});
  r=await inspect(settingsInstance,'preview_dropdown');assert.equal(r.nodes[0].open,true);
  assert.equal(r.nodes[0].listBackground,color(palettes.emerald.surface),'open popup changes palette in place');
  await event(settingsInstance,'preview_dropdown','key','escape');
  r=await inspect(settingsInstance,'current_scheme');assert.equal(r.nodes[0].text,'Текущая: Изумрудная');
  await command({op:'click',node:'go_overview'});
  r=await command({op:'inspect'});assert.equal(r.views[0].pageInstance,instance);
  const corrupt=join(dir,'corrupt.cbor');await writeFile(corrupt,new Uint8Array([1,2,3]));
  r=await command({op:'load',path:corrupt,entry:'shell'});assert.equal(r.ok,false);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  // A packet can be structurally valid but fail actual LVGL/resource validation.
  const nativeInvalid=structuredClone(original);
  nativeInvalid.screens.overview.root.style.text_font='missing_font';
  const invalidPacket=join(dir,'missing-resource.cbor');await writeFile(invalidPacket,encodeExample(nativeInvalid));
  r=await command({op:'load',path:invalidPacket,entry:'shell'});
  // Nested page failure uses the existing runtime placeholder; root remains usable.
  assert.equal(r.ok,true);assert.ok(r.views[0].error);
  await open(cbor);
  r=await command({op:'inspect'});instance=r.views[0].pageInstance;
  r=await inspect(instance,'running');assert.equal(r.nodes[0].state&screenContract.states.CHECKED,0);
  const rootInvalid=structuredClone(original);rootInvalid.screens.shell.root.style.text_font='missing_font';
  const rootPacket=join(dir,'bad-root.cbor');await writeFile(rootPacket,encodeExample(rootInvalid));
  r=await command({op:'load',path:rootPacket,entry:'shell'});assert.equal(r.ok,false);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  r=await command({op:'publish',source:'demo.clicks',value:'invalid'});assert.equal(r.ok,false);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  r=await command({op:'inspect'});assert.equal(r.views[0].selected,'overview');
  // Exercise combined focus/edit states through ordinary public common commands.
  // No physical input, synthetic OS focus, or widget-specific state implementation.
  for(const editing of [false,true]) {
    const stateProject=structuredClone(original),stateNodes=[];
    stateProject.screens.shell.root.children.find(node=>node.id==='content').view.initial='settings';
    function focusCommands(node) {
      if(['button','switch','checkbox','slider','arc','dropdown','textarea'].includes(node.type)) {
        stateNodes.push(node.id);node.common??={};
        node.common.add_state=(node.common.add_state??0)|screenContract.states.FOCUSED|screenContract.states.FOCUS_KEY|
          (editing?screenContract.states.EDITED:0);
      }
      for(const child of node.children)focusCommands(child);
    }
    focusCommands(stateProject.screens.settings.root);
    const stateFile=join(dir,'combined-states-'+editing+'.json');await writeFile(stateFile,JSON.stringify(stateProject));
    await open(stateFile);r=await command({op:'inspect'});const stateInstance=r.views[0].pageInstance;
    for(const [id,palette] of Object.entries(palettes)) {
      await command({op:'scheme',scheme:id});
      r=await inspect(stateInstance,...stateNodes);
      for(const node of r.nodes) {
        assert.ok(node.state&screenContract.states.FOCUS_KEY,node.id+' has keypad focus');
        // Textarea sends a focus event while restoring its text, which normalizes
        // EDITED to the actual group's mode. Its effective focus still must be themed.
        if(node.id!=='preview_textarea')assert.equal(Boolean(node.state&screenContract.states.EDITED),editing,node.id+' actual state '+node.state+' in '+id);
        assert.equal(node.outlineColor,color(palette.primary),node.id+' focus/edit outline follows '+id);
      }
      if(id==='cream'&&editing)assert.equal((await command({op:'snapshot',path:join(snapshots,'settings-focus-edit.bmp')})).ok,true);
    }
  }
  assert.equal(JSON.parse(r.dataJson).diagnostics.bindingErrors,0);
  await command({op:'scheme',scheme:'emerald'});
  // Watch hot reloads the authoring document, without changing the display dimensions.
  await open(json);
  const edited=structuredClone(original);edited.screens.overview.root.children.find(n=>n.id==='hint').props.text='Reloaded JSON';
  await writeFile(json,JSON.stringify(edited));await take(e=>e.event==='loaded'&&e.path===json);
  r=await command({op:'inspect'});instance=r.views[0].pageInstance;
  r=await inspect(instance,'hint','counter');assert.equal(r.nodes[0].text,'Reloaded JSON');assert.equal(r.nodes[1].text,'Actions: 12345');
  r=await inspect(instance,'running');assert.equal(r.nodes[0].state&screenContract.states.CHECKED,0);
  await writeFile(json,'{');await take(e=>e.event==='error');
  r=await inspect(instance,'hint');assert.equal(r.nodes[0].text,'Reloaded JSON');
  await writeFile(json,JSON.stringify(edited));await take(e=>e.event==='loaded'&&e.path===json);
  // Opening a project designed for another resolution recreates only the desktop session.
  const smaller=structuredClone(original);smaller.screens.shell.size={width:640,height:360};
  const small=join(dir,'small.json');await writeFile(small,JSON.stringify(smaller));
  const loaded=await open(small);assert.deepEqual([loaded.width,loaded.height],[640,360]);
  const image=await command({op:'inspect'});assert.equal(image.ok,true);assert.equal(image.scheme,'emerald');
  child.stdin.write('{"op":"quit"}\n');assert.equal(await exit,0);
  assert.deepEqual(JSON.parse(await readFile(settings,'utf8')),{scheme:'emerald'});
  // Restart a separate hidden process with the saved setting, without a CLI override.
  await new Promise((yes,no)=>{
    const restored=spawn(process.execPath,[join(here,'run.mjs'),join(here,'demo.json'),'--control','--hidden','--settings',settings,...executableArgs],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const timeout=setTimeout(()=>{restored.kill();no(Error('Settings restart timeout'));},15000);
    let checked=false;
    createInterface({input:restored.stdout}).on('line',line=>{
      const e=JSON.parse(line);
      if(e.event==='loaded')restored.stdin.write('{"op":"inspect","id":1}\n');
      if(e.event==='fatal'){restored.kill();no(Error(e.error));}
      if(e.event==='result'&&e.id===1) {
        try{assert.equal(e.scheme,'emerald');assert.equal(e.menuScheme,'emerald');assert.equal(e.views[0].selected,'system');
          restored.stdin.write(JSON.stringify({op:'click',id:2,node:'go_settings'})+'\n');}
        catch(error){restored.kill();no(error);}
      }
      if(e.event==='result'&&e.id===2) {
        restored.stdin.write(JSON.stringify({op:'inspect',id:3,nodes:[{id:'current_scheme',instance:e.views[0].pageInstance}]})+'\n');
      }
      if(e.event==='result'&&e.id===3) {
        try{assert.equal(e.nodes[0].text,'Текущая: Изумрудная');checked=true;restored.stdin.write('{"op":"quit"}\n');}
        catch(error){restored.kill();no(error);}
      }
    });
    restored.once('close',code=>{clearTimeout(timeout);if(checked&&code===0)yes();else no(Error('Settings restart failed'));});
  });
  console.log('PASS: hidden Win32 LVGL, all 12 standard types, four palettes, ON/OFF switch and checkbox, combined keypad focus/edit states, slider/text/dropdown writeback, popup, JSON/CBOR, bindings/actions, snapshots, stable geometry, nested retention, reload, errors, resize, shutdown');
} finally {
  if(!closed){child.stdin.end();await Promise.race([exit,new Promise(yes=>setTimeout(()=>{child.kill();yes();},3000))]);}
  for(const waiter of waiters)clearTimeout(waiter.timer);
  await rm(dir,{recursive:true,force:true});
}
