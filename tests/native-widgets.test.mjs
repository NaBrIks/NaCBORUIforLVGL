import test from 'node:test';
import assert from 'node:assert/strict';
import {ref,nextTick} from 'vue';
import {encodeScreen,decodeScreen,offlineCapabilities,widgetCatalog,encodeWidgetMethod,methodSchema,defaultParameter,parameterType} from '@lvgl-cbor/screen-codec';
import {nativeDemo,extensions} from '../examples/native_widget/demo-screen.mjs';
import {createNode} from '../frontend/src/screen-model.js';
import {readCatalogCache,useAuthoringCapabilities} from '../frontend/src/modules/native-widgets/authoring-capabilities.js';
import {recoverableNativeDraft} from '../frontend/src/modules/native-widgets/draft-recovery.js';
const caps={...offlineCapabilities(),extensions,availableWidgets:[...offlineCapabilities().availableWidgets,...extensions.map(w=>w.id)],resources:[{name:'montserrat_20',type:'const lv_font_t *'},{name:'montserrat_28',type:'const lv_font_t *'}]};
const copy=value=>JSON.parse(JSON.stringify(value));
test('unavailable native drafts survive recovery without becoming executable',()=>{
 const old=copy(nativeDemo);old.root.children[3].type='old:process';
 assert.ok(recoverableNativeDraft(old));assert.throws(()=>encodeScreen(old,'send',caps),/unavailable/);
 const bad=copy(old);bad.root.children[3].children={};assert.equal(recoverableNativeDraft(bad),false);
 const invalid=copy(old);invalid.size.width=-1;assert.equal(recoverableNativeDraft(invalid),false);
 assert.equal(old.root.children[3].type,'old:process');
});
test('device catalog provides identities, presentation, initial values and all method shapes',()=>{
 const families=widgetCatalog(caps).filter(w=>w.abi);
 assert.equal(families.length,3);
 for(const family of families){
  const node=createNode(family.name,'native',caps);
  assert.deepEqual(node.props,family.defaults);assert.deepEqual(node.style,family.preview);
  for(const method of family.methods){assert.ok(parameterType(methodSchema(method)));assert.doesNotThrow(()=>encodeWidgetMethod(family,method.alias,family.defaults[method.alias]??defaultParameter(methodSchema(method))));}
  node.props.title='Other instance';assert.notEqual(node.props.title,family.defaults.title);
 }
 assert.throws(()=>createNode('lab:signal','x'),/Неизвестный/);
});
test('all three native components roundtrip through the real compiler',()=>{
 const canonical=decodeScreen(encodeScreen(nativeDemo,'first',caps),caps);
 assert.deepEqual(decodeScreen(encodeScreen(canonical,'second',caps),caps),canonical);
 assert.deepEqual(canonical.root.children[3].props.targets,nativeDemo.root.children[3].props.targets);
 assert.throws(()=>encodeScreen(nativeDemo,'offline'),/Unsupported widget/);
 const unavailable=copy(caps);unavailable.availableWidgets=unavailable.availableWidgets.filter(n=>n!==260);
 assert.throws(()=>encodeScreen(nativeDemo,'unavailable',unavailable),/unavailable/);
 const changed=copy(caps);changed.extensions[2].abi='process-2';
 assert.throws(()=>decodeScreen(encodeScreen(nativeDemo,'abi',caps),changed),/ABI/);
});
for(const [name,value] of [['short tuple',[['A',1,50]]],['long',Array(9).fill(['A',1,50,80])],['nested scalar',[['A','1',50,80]]],['out of range',[['A',360,50,80]]],['boolean',[['A',1,true,80]]],['text budget',[['Ж'.repeat(13),1,50,80]]]]){
 test('complex method rejects '+name,()=>assert.throws(()=>encodeWidgetMethod(widgetCatalog(caps).at(-1),'targets',value)));
}
test('bounded recursive schema rejects unknown types, unbounded arrays and invalid metadata',()=>{
 for(const shape of ['mystery',{type:'array',items:'text'},{type:'tuple',items:[]},{type:'int32_t',values:[1],labels:[]}]){
  const invalid=copy(caps);invalid.extensions[0].contract.methods[0].parameters=[shape];assert.throws(()=>widgetCatalog(invalid));
 }
 const invalid=copy(caps);invalid.extensions[0].contract.preview.width=0;assert.throws(()=>widgetCatalog(invalid));
});
test('nested text counts toward shared screen memory limits on PC',()=>{
 const limited={...caps,limits:{...caps.limits,textBytes:100}};
 assert.throws(()=>encodeScreen(nativeDemo,'budget',limited),/memory limits/);
});
test('cached native catalog restores authoring after reload and never replaces live capabilities',async()=>{
 const stored=new Map();globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
 const live=ref(caps),authoring=useAuthoringCapabilities(live);await nextTick();
 const saved=readCatalogCache();assert.equal(saved.source,'offline-cache');assert.equal(widgetCatalog(saved).length,15);
 assert.doesNotThrow(()=>encodeScreen(nativeDemo,'restore',saved));
 live.value=null;await nextTick();assert.equal(authoring.value.source,'offline-cache');
 live.value={...caps,extensions:[],availableWidgets:offlineCapabilities().availableWidgets};await nextTick();assert.equal(widgetCatalog(authoring.value).length,12);
 stored.set('lvgl-cbor-native-catalog-1','broken');assert.equal(readCatalogCache(),null);
});
