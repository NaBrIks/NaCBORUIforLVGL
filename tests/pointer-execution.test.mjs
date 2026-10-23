import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeScreen,decodeScreen,decodeScreenPacket,offlineCapabilities,screenContract} from '../packages/screen-codec/index.js';
import {decodeStyle,encodeStyle,contract} from '../packages/style-codec/index.js';
import {encode} from 'cborg';
import {decodeNodeCommands} from '../packages/screen-codec/command-stream.js';
import {widgetCatalog} from '../packages/screen-codec/widget-catalog.js';
const tree=(bytes,caps)=>{const p=decodeScreenPacket(bytes);return decodeNodeCommands(p.get('root'),widgetCatalog(caps),p.get('captions'));};
const load=async name=>JSON.parse(await readFile(new URL('../examples/screens/'+name+'.json',import.meta.url)));
const doc=()=>({format:'lvgl-screen-draft-1',id:'custom',name:'Custom',size:{width:800,height:480},root:{id:'root',type:'obj',children:[{id:'meter',type:'example:meter',props:{reading:[42,'kPa'],alarm:3,value:0}}]}});
async function caps(){const c=offlineCapabilities();c.extensions=[{id:256,name:'example:meter',abi:'meter-1',contract:JSON.parse(await readFile(new URL('../examples/native_widget/meter.json',import.meta.url)))}];c.availableWidgets.push(256);return c;}
test('compiled widget wire order follows PC phases, not numeric CBOR key order',async()=>{
 const d=await load('widgets');d.root.children.find(n=>n.type==='textarea').props={text:'abcdef',one_line:true,max_length:3};
 const bytes=encodeScreen(d,'order'),node=tree(bytes).get('children').find(n=>n.get('type')===10);
 const family=screenContract.widgets.find(w=>w.name==='textarea'),names=[...node.get('widget').keys()].map(k=>family.methods.find(m=>m.opcode===k).alias);
 assert.deepEqual(names,['max_length','one_line','text']);assert.deepEqual(encodeScreen(decodeScreen(bytes),'order'),bytes);
});
test('runtime extension catalog compiles, orders and roundtrips a mixed native signature',async()=>{
 const c=await caps(),source=doc(),bytes=encodeScreen(source,'custom',c),wire=tree(bytes,c).get('children')[0];
 assert.equal(wire.get('type'),256);assert.equal(wire.get('extension'),'meter-1');assert.deepEqual([...wire.get('widget').keys()],[256,257,258]);
 assert.deepEqual(encodeScreen(decodeScreen(bytes,c),'custom',c),bytes);assert.throws(()=>encodeScreen(source,'custom'),/Unsupported/);
 source.root.children[0].props.alarm=11;assert.throws(()=>encodeScreen(source,'custom',c),/range/);
 const changed=structuredClone(c);changed.extensions[0].abi='meter-2';assert.throws(()=>decodeScreen(bytes,changed),/ABI/);
});
test('compiler rejects semantic errors formerly checked on the MCU',async()=>{
 const widgets=await load('widgets');widgets.root.children.find(n=>n.type==='slider').props={min:100,max:0};assert.throws(()=>encodeScreen(widgets,'bad'));
 const grid=await load('grid');grid.root.children[0].style.grid_cell_column_pos=2;assert.throws(()=>encodeScreen(grid,'bad'),/bounds/);
 const d=await load('absolute');d.root.common={add_flags:16,remove_flags:16};assert.throws(()=>encodeScreen(d,'bad'),/Contradictory/);
 for(const props of [{size:[10,10],width:20},{bg_opa:256}])assert.throws(()=>encodeStyle({scope:'screen',name:'x',props},'bad'));
});
test('v1 packets are rejected instead of interpreted with v3 method numbers',async()=>{
 assert.equal(contract.version,2);assert.equal(screenContract.version,3);
 const style=new Map([['v',1],['id','old'],['scope','screen'],['name','old'],['methods',new Map()]]);assert.throws(()=>decodeStyle(encode(style)),/packet/);
 const screen=decodeScreenPacket(encodeScreen(await load('absolute'),'old'));screen.set('v',1);assert.throws(()=>decodeScreen(encode(screen)),/ABI/);
});
test('extension aliases do not inherit standard widget shorthand and mixed text obeys storage limits',async()=>{
 const c=await caps(),d=doc();
 c.extensions[0].contract.methods[0].alias='range';
 d.root.children[0].props={range:5,reading:[42,'unit']};
 const bytes=encodeScreen(d,'aliases',c),back=decodeScreen(bytes,c);
 assert.equal(back.root.children[0].props.range,5);assert.deepEqual(encodeScreen(back,'aliases',c),bytes);
 c.limits.textBytes=2;assert.throws(()=>encodeScreen(d,'limit',c),/memory/);
});
