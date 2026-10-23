import {readFile,writeFile} from 'node:fs/promises';
import {encode} from 'cborg';
import {encodeScreen,decodeScreenPacket,screenContract as C} from '../packages/screen-codec/index.js';
import {contract as S} from '../packages/style-codec/index.js';
const dir=new URL('../local/screen-fixtures/',import.meta.url);
const source=JSON.parse(await readFile(new URL('../examples/screens/absolute.json',import.meta.url)));
const base=decodeScreenPacket(encodeScreen(source,'cursor'));
const method=(type,alias)=>C.widgets.find(w=>w.name===type).methods.find(m=>m.alias===alias).opcode;
const style=alias=>S.methods.find(m=>m.alias===alias).opcode;
const common=alias=>C.common.methods.find(m=>m.alias===alias).opcode;
const node=(type,id,body=[])=>[0,C.widgets.find(w=>w.name===type).id,[[1,id],...body]];
const write=async(name,root,extra=[])=>{const p=new Map(base);p.set('root',root);for(const [k,v] of extra)p.set(k,v);await writeFile(new URL(name+'.cbor',dir),encode(p));};
const label=(id,text)=>node('label',id,[[method('label','text'),text]]);
// Intentional execution order: parent methods after child return; then a sibling and root style.
const program=node('obj','root',[
 node('label','parent',[
  [method('label','text'),'before'],
  node('button','button',[label('caption','inside')]),
  [method('label','text'),'after'],
  [common('add_state'),C.states.DISABLED]
 ]),
 label('sibling','sibling'),
 [2,[0,new Map([[style('bg_color'),0x123456]])]]
]);
await write('cursor_interleaved',program);
await write('cursor_empty',node('obj','root',[[0,C.widgets.find(w=>w.name==='obj').id,[]],label('sibling','after empty')]));
let deep=label('deep','bottom');for(let i=0;i<11;i++)deep=node('obj','depth'+i,[deep]);await write('cursor_max_depth',deep);
for(const [name,op] of Object.entries({
 reserved:[255,0],unknown_local:[65535,0],wrong_component:[256,'text on obj'],
 missing_argument:[4],extra_argument:[4,0,123],bad_create:[0,1],unknown_type:[0,65535,[]],
 bad_style:[2,[0,123]],bad_opcode:['4',0]
}))await write('cursor_bad_'+name,node('obj','root',[label('created','must be rolled back'),op]));
await write('cursor_v2',node('obj','root'),[['v',2]]);
const ext=decodeScreenPacket(await readFile(new URL('extension.cbor',dir)));
ext.get('root')[2].find(op=>op[0]===0)[1][0]='example:meter';
await writeFile(new URL('extension_name.cbor',dir),encode(ext));
console.log('Cursor fixtures: nested return, interleaved operations, boundary failures, extension name.');
