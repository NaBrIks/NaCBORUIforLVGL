import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {serializeDocument,parseDocument,documentFilename,maxDocumentBytes} from '../packages/document-io/index.js';
import {encodeScreen} from '../packages/screen-codec/index.js';
import {encodeStyle} from '../packages/style-codec/index.js';
import {createScreen} from '../frontend/src/screen-model.js';

const style={scope:'screen',name:'пример',props:{pad_all:12,bg_color:'#123456',bg_opa:128,text_font:'montserrat_28',width:{pct:75}},attach:true};
test('all screen examples survive JSON and CBOR files with identical native packets',async()=>{
 for(const file of await readdir('examples/screens')){if(!file.endsWith('.json'))continue;const doc=JSON.parse(await readFile('examples/screens/'+file,'utf8'));
  for(const format of ['json','cbor']){const bytes=serializeDocument('screen',doc,format),loaded=parseDocument('screen',bytes);assert.deepEqual(encodeScreen(loaded,'compare'),encodeScreen(doc,'compare'),file+' '+format);}
 }
});
test('style files preserve Unicode, aliases, dimensions, resource names and composition',()=>{
 for(const format of ['json','cbor']){const loaded=parseDocument('style',serializeDocument('style',style,format));assert.deepEqual(encodeStyle(loaded,'compare'),encodeStyle(style,'compare'));}
 const bytes=serializeDocument('screen',createScreen(),'json');assert.deepEqual(parseDocument('screen',new Uint8Array([239,187,191,...bytes])),createScreen());
 assert.equal(documentFilename('screen',{id:'../../x:abc'},'json'),'.._.._x_abc.json');
});
test('file validation rejects wrong kinds, empty/truncated/trailing/foreign ABI packets and invalid UTF8',()=>{
 const bytes=serializeDocument('screen',createScreen(),'cbor');
 for(let length=0;length<bytes.length;length++)assert.throws(()=>parseDocument('screen',bytes.slice(0,length),{format:'cbor'}),'truncated '+length);
 assert.throws(()=>parseDocument('screen',new Uint8Array([...bytes,0])));
 assert.throws(()=>parseDocument('style',bytes));
 assert.throws(()=>parseDocument('screen',new Uint8Array([123,255,125]),{format:'json'}));
 assert.throws(()=>parseDocument('screen',new Uint8Array(maxDocumentBytes+1)));
 assert.throws(()=>parseDocument('screen','{"root":{}}'));
 assert.throws(()=>serializeDocument('screen',createScreen(),'xml'));
 assert.throws(()=>parseDocument('__proto__',bytes));
});
test('imports and exports check actual device limits and never mutate the source',()=>{
 const doc=createScreen(),before=structuredClone(doc),caps={limits:{screenPacketBytes:32}};
 assert.throws(()=>serializeDocument('screen',doc,'json',{capabilities:caps}));
 assert.throws(()=>parseDocument('screen',serializeDocument('screen',doc,'cbor'),{capabilities:caps}));
 assert.deepEqual(doc,before);
});
