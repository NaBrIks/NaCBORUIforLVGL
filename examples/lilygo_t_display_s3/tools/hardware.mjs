import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {connectSerial} from './serial_cbor.mjs';
import {screenContract} from '../../../packages/screen-codec/index.js';
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const port=option('--port'),python=option('--python','python'),output=resolve(option('--output','local/lilygo-hardware.json'));
if(!port)throw Error('Usage: node examples/lilygo_t_display_s3/tools/hardware.mjs --port PORT [--python PYTHON] [--output FILE]');
const device=connectSerial({port,python}),checks=[];
const source=(result,name)=>JSON.parse(result.dataJson).sources.find(item=>item.name===name)?.value;
const checked=node=>Boolean(node.state&screenContract.states.CHECKED);
const color=value=>parseInt(value.slice(1),16);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const command=async request=>{const result=await device.command(request);assert.equal(result.ok,true,JSON.stringify(result));return result;};
const inspect=(instance,...ids)=>command({op:'inspect',nodes:ids.map(id=>({id,instance}))});
async function toggle(instance,node) {for(const event of ['pressed','released'])await command({op:'event',instance,node,event});}
const project=JSON.parse(await readFile(new URL('../demo.json',import.meta.url),'utf8'));
const palettes=JSON.parse(await readFile(new URL('../../windows_player/schemes.json',import.meta.url),'utf8')).schemes;
try {
  let r=await command({op:'inspect'});assert.deepEqual([r.width,r.height],[320,170]);assert.ok(r.flushes>0);
  await command({op:'click',node:'go_home'});r=await command({op:'inspect'});const homeInstance=r.views[0].pageInstance;
  const initial=source(r,'demo.speed').sequence;await pause(180);r=await command({op:'inspect'});assert.ok(source(r,'demo.speed').sequence>initial);checks.push('autonomous CBOR speed');
  await command({op:'write',source:'demo.running',value:false});
  await command({op:'publish',source:'demo.speed',value:{kmh:42.5,unit:'km/h',sequence:7}});
  await command({op:'invoke',action:'demo.reset',value:null});
  await command({op:'click',node:'step',instance:homeInstance});
  r=await inspect(homeInstance,'speed','speed_arc','counter');assert.equal(r.nodes[0].text,'42.5');assert.equal(r.nodes[1].value,43);assert.equal(r.nodes[2].text,'Count: 1');
  checks.push('formatted/fractional bindings and action event');
  for(const [id,palette] of Object.entries(palettes)) {
    await command({op:'scheme',scheme:id});r=await inspect(homeInstance,'root','running');
    assert.equal(source(r,'ui.scheme').title,palette.name,'UTF-8 title survives CBOR/USB/host adaptation');
    assert.equal(r.nodes[0].background,color(palette.canvas));assert.equal(checked(r.nodes[1]),false);assert.equal(r.nodes[1].indicatorOpacity,0);
    await toggle(homeInstance,'running');r=await inspect(homeInstance,'running');assert.ok(checked(r.nodes[0]));assert.equal(r.nodes[0].indicatorColor,color(palette.primary));assert.equal(source(r,'demo.running'),true);
    await toggle(homeInstance,'running');r=await inspect(homeInstance,'running');assert.equal(source(r,'demo.running'),false);
  }
  checks.push('four palettes and ON/OFF switch writeback');
  await command({op:'click',node:'go_controls'});r=await command({op:'inspect'});assert.equal(r.views[0].selected,'controls');const controlsInstance=r.views[0].pageInstance;
  await command({op:'write',source:'demo.checked',value:true});await toggle(controlsInstance,'checked');r=await inspect(controlsInstance,'checked');assert.equal(checked(r.nodes[0]),false);assert.equal(source(r,'demo.checked'),false);
  await command({op:'write',source:'demo.level',value:65});await command({op:'event',node:'slider',instance:controlsInstance,event:'key',key:'right'});
  r=await inspect(controlsInstance,'slider');assert.equal(r.nodes[0].value,66);assert.equal(source(r,'demo.level'),66);
  await command({op:'write',source:'demo.text',value:'Text'});await command({op:'event',node:'text',instance:controlsInstance,event:'key',key:88});
  r=await inspect(controlsInstance,'text');assert.equal(r.nodes[0].text,'TextX');assert.equal(source(r,'demo.text'),'TextX');
  await command({op:'event',node:'text',instance:controlsInstance,event:'key',key:'backspace'});
  await command({op:'write',source:'demo.choice',value:0});await command({op:'event',node:'choice',instance:controlsInstance,event:'key',key:'down'});
  r=await inspect(controlsInstance,'choice');assert.equal(r.nodes[0].open,true);
  await command({op:'event',node:'choice',instance:controlsInstance,event:'key',key:'down'});await command({op:'event',node:'choice',instance:controlsInstance,event:'key',key:'enter'});
  r=await inspect(controlsInstance,'choice');assert.equal(r.nodes[0].value,1);assert.equal(source(r,'demo.choice'),1);checks.push('checkbox/slider/textarea/dropdown event writeback');
  for(const page of ['home','controls','schemes']) {
    await command({op:'click',node:'go_'+page});r=await command({op:'inspect'});const instance=r.views[0].pageInstance;
    const tree=[];function walk(node,parent=null){tree.push({id:node.id,parent});node.children.forEach(child=>walk(child,node.id));}walk(project.screens[page].root);
    r=await inspect(instance,...tree.map(node=>node.id));const bounds=new Map(r.nodes.map(node=>[node.id,node.bounds]));
    for(const node of tree)if(node.parent){const child=bounds.get(node.id),parent=bounds.get(node.parent);assert.ok(child[0]>=parent[0]&&child[1]>=parent[1]&&child[2]<=parent[2]&&child[3]<=parent[3],page+'/'+node.id+' fits parent');}
  }
  checks.push('actual component bounds in all three composed pages');
  r=await command({op:'inspect'});const schemesInstance=r.views[0].pageInstance;
  for(const id of Object.keys(palettes)){await command({op:'click',instance:schemesInstance,node:'scheme_'+id});r=await command({op:'inspect'});assert.equal(r.scheme,id);}
  const invalid=await device.command({op:'scheme',scheme:'absent'});assert.equal(invalid.ok,false);r=await command({op:'inspect'});assert.equal(r.scheme,'dark');
  checks.push('scheme buttons and invalid selection preservation');
  await command({op:'scheme',scheme:'cream'});await command({op:'write',source:'demo.checked',value:true});await command({op:'write',source:'demo.running',value:true});
  const beforeHidden=source(await command({op:'inspect'}),'demo.speed').sequence;await pause(200);await command({op:'click',node:'go_home'});
  r=await command({op:'inspect'});assert.equal(r.views[0].pageInstance,homeInstance);assert.ok(source(r,'demo.speed').sequence>beforeHidden);
  assert.equal(JSON.parse(r.dataJson).diagnostics.bindingErrors,0);checks.push('retained page, source continuity while hidden, no binding errors');
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({timestamp:new Date().toISOString(),checks,result:r},null,2)+'\n');
  console.log('PASS: T-Display-S3 '+checks.join('; '));
} finally {await device.close();}
