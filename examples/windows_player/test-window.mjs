import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {encodeProject} from '../../packages/project-codec/index.js';
import {screenContract} from '../../packages/screen-codec/index.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const dir=await mkdtemp(join(tmpdir(),'nacborui-window-test-'));
const json=join(dir,'проект with spaces.json'),cbor=join(dir,'project.cbor');
const original=JSON.parse(await readFile(join(here,'demo.json'),'utf8'));
await writeFile(json,JSON.stringify(original));await writeFile(cbor,encodeProject(original));
const child=spawn(process.execPath,[join(here,'run.mjs'),json,'--control','--watch'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
let stderr='',next=0,closed=false;
child.stderr.on('data',bytes=>stderr+=bytes);
const events=[],waiters=[];
function take(predicate,timeout=15000) {
  const index=events.findIndex(predicate);if(index>=0)return Promise.resolve(events.splice(index,1)[0]);
  return new Promise((yes,no)=>{
    const waiter={predicate,yes,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);no(Error('Player wait timeout; stderr: '+stderr));},timeout)};
    waiters.push(waiter);
  });
}
createInterface({input:child.stdout}).on('line',line=>{
  let event;try{event=JSON.parse(line);}catch{return;}
  const index=waiters.findIndex(w=>w.predicate(event));
  if(index>=0){const [w]=waiters.splice(index,1);clearTimeout(w.timer);w.yes(event);}else events.push(event);
});
const exit=new Promise(yes=>child.on('close',code=>{closed=true;yes(code);}));
async function command(request){const id=++next;child.stdin.write(JSON.stringify({...request,id})+'\n');return take(e=>e.event==='result'&&e.id===id);}
async function open(path){child.stdin.write(JSON.stringify({op:'open',path})+'\n');return take(e=>e.event==='loaded'&&e.path===path);}
const inspect=(instance,...ids)=>command({op:'inspect',nodes:ids.map(id=>({id,instance}))});
try {
  await take(e=>e.event==='loaded');
  let r=await command({op:'inspect'});assert.equal(r.ok,true);assert.equal(r.views[0].selected,'overview');
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
  const corrupt=join(dir,'corrupt.cbor');await writeFile(corrupt,new Uint8Array([1,2,3]));
  r=await command({op:'load',path:corrupt,entry:'shell'});assert.equal(r.ok,false);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  // A packet can be structurally valid but fail actual LVGL/resource validation.
  const nativeInvalid=structuredClone(original);
  nativeInvalid.screens.overview.root.style.text_font='missing_font';
  const invalidPacket=join(dir,'missing-resource.cbor');await writeFile(invalidPacket,encodeProject(nativeInvalid));
  r=await command({op:'load',path:invalidPacket,entry:'shell'});
  // Nested page failure uses the existing runtime placeholder; root remains usable.
  assert.equal(r.ok,true);assert.ok(r.views[0].error);
  await open(cbor);
  r=await command({op:'inspect'});instance=r.views[0].pageInstance;
  r=await inspect(instance,'running');assert.equal(r.nodes[0].state&screenContract.states.CHECKED,0);
  const rootInvalid=structuredClone(original);rootInvalid.screens.shell.root.style.text_font='missing_font';
  const rootPacket=join(dir,'bad-root.cbor');await writeFile(rootPacket,encodeProject(rootInvalid));
  r=await command({op:'load',path:rootPacket,entry:'shell'});assert.equal(r.ok,false);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  r=await command({op:'publish',source:'demo.clicks',value:'invalid'});assert.equal(r.ok,false);
  r=await inspect(instance,'counter');assert.equal(r.nodes[0].text,'Actions: 12345');
  r=await command({op:'inspect'});assert.equal(r.views[0].selected,'overview');
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
  const image=await command({op:'inspect'});assert.equal(image.ok,true);
  child.stdin.write('{"op":"quit"}\n');assert.equal(await exit,0);
  console.log('PASS: real Win32 LVGL, JSON/CBOR, CBOR source updates, bindings, actions, nested pages, retention, watch reload, invalid-file preservation, resize, clean shutdown');
} finally {
  if(!closed){child.stdin.end();await Promise.race([exit,new Promise(yes=>setTimeout(()=>{child.kill();yes();},3000))]);}
  for(const waiter of waiters)clearTimeout(waiter.timer);
  await rm(dir,{recursive:true,force:true});
}
