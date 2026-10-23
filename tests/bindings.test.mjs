import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {createRenderer,h,ref} from 'vue';
import {createServer} from 'vite';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {fileURLToPath} from 'node:url';
import {bindingContract,offlineCapabilities,widgetCatalog,screenContract,encodeScreen,decodeScreen,decodeScreenPacket,validateDataSchema,validateDataValue,dataSchemaAtPath,validateBindingCapabilities,inspectExpression,evaluateExpression,UNKNOWN,formatBindingValue,encodeWidgetMethod,normalizeScreen} from '../packages/screen-codec/index.js';
import {createBlankScreen,removeNode,moveNodeTo,clone} from '../frontend/src/screen-model.js';
import {createExpression,replaceSourcePathSegment,hasObjectField,toggleObjectField,initialDataValue} from '../frontend/src/modules/bindings/binding-model.js';
import {useScreenController} from '../frontend/src/state/screen-controller.js';
const binding={version:1,sha256:bindingContract.sha256,sources:[
 {name:'pressure',title:'Pressure',schema:{type:'number',min:0,max:100}},
 {name:'settings',schema:{type:'object',fields:{limit:'number',enabled:'bool'}},writable:true},
 {name:'devices',schema:{type:'array',minItems:0,maxItems:8,items:{type:'object',fields:{name:{type:'text',maxBytes:63},rssi:'integer'}}}}
],actions:[{name:'clear',schema:'null'},{name:'configure',schema:{type:'object',fields:{enabled:'bool',limit:'number'}}}],events:bindingContract.events,limits:bindingContract.limits};
const caps={...offlineCapabilities(),source:'device',binding};
const source=(name,path=[])=>({source:name,path}),literal=value=>({literal:value}),op=(name,...args)=>({op:name,args});
const comparison=op('gt',source('pressure'),source('settings',['limit']));
const textNode=()=>({id:'pressure-value',type:'label',props:{text:'--'},bindings:[{method:'text',value:source('pressure'),format:{precision:1,suffix:' bar'}}]});
const screen=()=>{const doc=createBlankScreen('main','Bindings');doc.root.children=[textNode(),{id:'toggle',type:'switch',props:{},bindings:[{scope:'common',method:'state',value:[literal(screenContract.states.CHECKED),source('settings',['enabled'])]}],events:[{event:'value_changed',write:{source:'settings',path:['enabled']},value:{event:'value'}}]},{id:'clear',type:'button',props:{text:'Clear'},events:[{event:'clicked',action:'clear',args:literal(null)}]}];return doc;};

test('binding catalog, bounded schemas and scalar/object/array snapshots share strict validation',()=>{
 assert.equal(validateBindingCapabilities(caps),binding);for(const schema of binding.sources.map(s=>s.schema))assert.doesNotThrow(()=>validateDataSchema(schema));
 assert.doesNotThrow(()=>validateDataValue([{name:'Tag',rssi:-64}],binding.sources[2].schema));
 assert.doesNotThrow(()=>validateDataValue({},binding.sources[1].schema)); // Partial object snapshots have unknown missing paths.
 for(const value of [NaN,Infinity,undefined,{'bad':()=>0},Array(257).fill(0),'\ud800'])assert.throws(()=>validateDataValue(value));
 for(const schema of [{type:'array',items:'text'},{type:'integer',min:1.5},{type:'bool',max:1},{type:'text',maxBytes:4097},{type:'object',fields:{constructor:'text'}},{type:'number',min:2,max:1}])assert.throws(()=>validateDataSchema(schema));
 assert.equal(dataSchemaAtPath(binding.sources[2].schema,[7,'rssi']),'integer');
 for(const path of [[8,'name'],['0','name'],[0,'missing'],[-1],Array(9).fill('x')])assert.throws(()=>dataSchemaAtPath(binding.sources[2].schema,path));
 const duplicate=structuredClone(caps);duplicate.binding.sources.push(duplicate.binding.sources[0]);assert.throws(()=>validateBindingCapabilities(duplicate),/Duplicate/);
 const changed=structuredClone(caps);changed.binding.sha256='other';assert.throws(()=>validateBindingCapabilities(changed),/contract/);
});
test('expression typing covers multiple dependencies, lazy select, boolean short circuit and half-away round',()=>{
 assert.deepEqual(inspectExpression(comparison,{capabilities:caps}).dependencies,['pressure','settings']);
 assert.equal(evaluateExpression(comparison,{sources:{pressure:3,settings:{limit:2}}}),true);
 assert.equal(evaluateExpression(comparison,{sources:{pressure:3,settings:{}}}),UNKNOWN);
 assert.equal(evaluateExpression(op('select',literal(true),literal('known'),source('missing'))),'known');
 assert.equal(evaluateExpression(op('and',source('unknown'),literal(false))),false);
 assert.equal(evaluateExpression(op('or',source('unknown'),literal(true))),true);
 assert.equal(evaluateExpression(op('not',source('unknown'))),UNKNOWN);
 assert.equal(evaluateExpression(op('round',literal(-2.5))),-3);assert.equal(Object.is(evaluateExpression(op('round',literal(-.1))),-0),false);
 assert.equal(evaluateExpression(op('div',literal(3),literal(0))),UNKNOWN);
 assert.equal(evaluateExpression(op('eq',literal(1),literal(1.0))),true);
 assert.equal(evaluateExpression(op('eq',literal(true),literal(null))),false);assert.doesNotThrow(()=>inspectExpression(op('eq',literal(true),literal(null))));
 assert.equal(evaluateExpression(op('mul',literal('2'),literal(3))),UNKNOWN);assert.equal(evaluateExpression(op('not',literal(0))),UNKNOWN);
 assert.equal(evaluateExpression(op('lt',literal('\ue000'),literal('\u{10000}'))),true); // Same UTF-8 byte ordering as C++.
 assert.equal(evaluateExpression(source('pressure'),{sources:[{name:'pressure',state:'stale',value:3}]}),UNKNOWN);
 assert.equal(evaluateExpression(source('devices',[0,'rssi']),{sources:{devices:[]}}),UNKNOWN);
 const object={object:{enabled:{event:'value'},limit:source('settings',['limit'])}};
 assert.equal(inspectExpression(object,{capabilities:caps,eventContext:true,eventSchema:'bool'}).schema.type,'object');
 assert.deepEqual(evaluateExpression(object,{event:true,sources:{settings:{limit:2.5}}}),{enabled:true,limit:2.5});
});
test('expressions reject executable/unknown shapes and respect independent AST and literal budgets',()=>{
 for(const expr of [{source:'pressure',literal:1},{op:'eval',args:[]},{op:'__proto__',args:[]},op('gt',literal(true),literal(3)),op('not',literal(1)),op('select',literal(0),literal(1),literal(2)),{event:'value'},{literal:()=>0},{object:{constructor:literal(0)}}])assert.throws(()=>inspectExpression(expr,{capabilities:caps}));
 assert.throws(()=>inspectExpression(source('missing'),{capabilities:caps}),/Unknown binding source/);
 assert.throws(()=>inspectExpression(source('devices',[8]),{capabilities:caps}),/path/);
 assert.doesNotThrow(()=>inspectExpression({literal:Array(256).fill([1,2])})); // One AST node, bounded data value.
 assert.throws(()=>inspectExpression(Array.from({length:64},()=>literal(0))),/expression limit/);
 let nested=literal(0);for(let i=0;i<8;i++)nested=op('round',nested);assert.throws(()=>inspectExpression(nested),/limit/);
 const limited={...caps,binding:{...binding,limits:{...binding.limits,expressionNodes:2}}};assert.throws(()=>inspectExpression(op('add',literal(1),literal(2)),{capabilities:limited}),/limit/);
 const byteLimited={...caps,binding:{...binding,limits:{...binding.limits,valueBytes:8}}};assert.throws(()=>inspectExpression(literal('12345678'),{capabilities:byteLimited}),/byte limit/);
 const composite=screen();composite.root.children[2].events[0]={event:'clicked',action:'configure',args:{object:{enabled:literal(true),limit:literal(2)}}};assert.throws(()=>encodeScreen(composite,'limited',byteLimited),/byte limit/);
});
test('bindings flatten node IDs and numeric methods with canonical JSON/CBOR roundtrip',()=>{
 const doc=screen(),original=clone(doc),packet=decodeScreenPacket(encodeScreen(doc,'bindings',caps));
 assert.equal(packet.get('bindings_version'),1);assert.equal(packet.get('bindings')[0].get('node'),'pressure-value');assert.equal(packet.get('bindings')[0].get('method'),256);
 const decoded=decodeScreen(encodeScreen(doc,'first',caps),caps);assert.deepEqual(decodeScreen(encodeScreen(decoded,'next',caps),caps),decoded);assert.deepEqual(doc,original);
 assert.deepEqual(decoded.root.children[1].bindings[0],doc.root.children[1].bindings[0]);assert.deepEqual(decoded.root.children[2].events[0],doc.root.children[2].events[0]);
 const plainText=screen();delete plainText.root.children[0].bindings[0].format;const wire=decodeScreenPacket(encodeScreen(plainText,'unknown',caps));assert.equal(wire.get('bindings')[0].get('format').size,0);assert.equal(decodeScreen(encodeScreen(plainText,'normalize',caps),caps).root.children[0].bindings[0].format,undefined);
 assert.equal(formatBindingValue(UNKNOWN),'--');assert.equal(formatBindingValue(1.25,{precision:1,prefix:'P=',suffix:' bar'}),'P=1.3 bar');
 assert.equal(formatBindingValue(-1.25,{precision:1}),'-1.3');assert.equal(formatBindingValue(2.675,{precision:2}),'2.68');
 assert.equal(formatBindingValue(1.234567890123456),'1.23456789012346');assert.equal(formatBindingValue(1e-6),'1e-06');assert.equal(formatBindingValue(1e-4),'0.0001');
 assert.equal(formatBindingValue(100000000000000.5),'100000000000001');assert.equal(formatBindingValue(-100000000000000.5),'-100000000000001');
 assert.throws(()=>formatBindingValue(1e21,{precision:0}),/binding_format_range/);
 assert.throws(()=>formatBindingValue(1,{precision:7}),/precision/);
});
test('live capability authority rejects bad target/source/write/action/type while offline files remain editable',()=>{
 const mutations=[d=>d.root.children[0].bindings[0].value=source('missing'),d=>d.root.children[0].bindings[0].method='missing',d=>d.root.children[1].bindings[0].value=[literal(4),literal(3)],d=>d.root.children[1].events[0].write.source='pressure',d=>d.root.children[2].events[0].action='missing',d=>d.root.children[2].events[0].args={event:'value'},d=>d.root.children[0].bindings.push(d.root.children[0].bindings[0]),d=>d.bindings=[{}]];
 for(const mutate of mutations){const doc=screen();mutate(doc);assert.throws(()=>encodeScreen(doc,'reject',caps));}
 const doc=screen();doc.root.children[0].bindings[0].value=source('application.custom',[1,'nested']);doc.root.children[2].events[0].action='application.custom';
 assert.doesNotThrow(()=>encodeScreen(doc,'offline'));assert.doesNotThrow(()=>encodeScreen(doc,'offline',offlineCapabilities()));
 assert.deepEqual(normalizeScreen(doc).root.children[0].bindings,doc.root.children[0].bindings);
 assert.throws(()=>encodeScreen(screen(),'unsupported',{...caps,binding:undefined}),/unavailable/);
 const badWire=decodeScreenPacket(encodeScreen(screen(),'wire',caps));badWire.get('bindings')[0].set('node','missing');assert.throws(()=>decodeScreen(encode(badWire),caps),/node/);
 const noVersion=decodeScreenPacket(encodeScreen(screen(),'wire',caps));noVersion.delete('bindings_version');assert.throws(()=>decodeScreen(encode(noVersion),caps),/version/);
});
test('node-bound rules follow movement, screen copy and subtree removal without stale target references',()=>{
 const doc=screen();doc.root.children.push({id:'container',type:'obj',children:[]});const copy=clone(doc);
 assert.equal(moveNodeTo(doc.root,'pressure-value','container','inside'),true);const wire=decodeScreenPacket(encodeScreen(doc,'moved',caps));assert.equal(wire.get('bindings')[1].get('node'),'pressure-value');
 assert.equal(removeNode(doc.root,'container'),true);const after=decodeScreenPacket(encodeScreen(doc,'removed',caps));assert.equal(after.get('bindings').length,1);assert.equal(copy.root.children[0].bindings.length,1);
});
test('changing an array index preserves a valid item field and keeps the binding scalar',()=>{
 const original=source('devices',[0,'name']),schema=binding.sources.find(s=>s.name==='devices').schema;
 const next=replaceSourcePathSegment(original,0,1,schema);assert.deepEqual(next,source('devices',[1,'name']));assert.deepEqual(original,source('devices',[0,'name']));
 const doc=screen();doc.root.children[0].bindings=[{method:'text',value:next}];assert.doesNotThrow(()=>encodeScreen(doc,'index-edit',caps));
 assert.deepEqual(normalizeScreen(doc,caps).root.children[0].bindings[0].value,next);
 assert.deepEqual(replaceSourcePathSegment(source('devices',[0,'missing']),0,1,schema).path,[1]);
 assert.deepEqual(replaceSourcePathSegment(original,0,8,schema).path,[8]); // A catalog-invalid index cannot preserve the old suffix.
 assert.deepEqual(replaceSourcePathSegment(source('settings',['limit','old']),0,'enabled',binding.sources[1].schema).path,['enabled']);
});
test('native object/number parameters and event value schemas use registration metadata without privileged components',()=>{
 const extension={id:300,name:'test:generic',abi:'test-1',contract:{methods:[{alias:'state',opcode:256,parameters:[{type:'object',fields:{level:{type:'number',min:-10,max:10},title:{type:'text',maxBytes:12}}}]}],events:[{name:'value_changed',value:{type:'object',fields:{level:'number',title:'text'}}}]}};
 const nativeCaps={...caps,extensions:[extension],availableWidgets:[...caps.availableWidgets,300]};
 const family=widgetCatalog(nativeCaps).at(-1);assert.deepEqual(encodeWidgetMethod(family,'state',{level:1.5,title:'A'})[1],{level:1.5,title:'A'});assert.throws(()=>encodeWidgetMethod(family,'state',{level:11,title:'A'}));
 const doc=createBlankScreen();doc.root.children=[{id:'generic',type:family.name,bindings:[{method:'state',value:{object:{level:source('pressure'),title:literal('A')}}},{scope:'common',method:'state',value:[literal(4),literal(true)]}],events:[{event:'value_changed',action:'configure',args:{object:{enabled:literal(true),limit:source('settings',['limit'])}}}]}];
 const normalized=decodeScreen(encodeScreen(doc,'native',nativeCaps),nativeCaps);assert.equal(normalized.root.children[0].bindings[0].scope,undefined);assert.equal(normalized.root.children[0].bindings[1].scope,'common');
});
test('optional object fields are added and removed explicitly without materializing other values',()=>{
 const schema=binding.actions.find(action=>action.name==='configure').schema,original={enabled:false};
 assert.deepEqual(initialDataValue(schema),{});assert.deepEqual(createExpression('object',schema),{object:{}});assert.deepEqual(createExpression('literal',schema),literal({}));
 assert.deepEqual(initialDataValue({type:'array',items:schema,minItems:1,maxItems:2}),[{}]);
 let created=0;const enabled=toggleObjectField(original,'enabled',true,()=>{created++;return true;});assert.deepEqual(enabled,original);assert.equal(created,0);assert.equal(hasObjectField(original,'enabled'),true);
 const added=toggleObjectField(original,'limit',true,()=>initialDataValue(schema.fields.limit));assert.deepEqual(added,{enabled:false,limit:0});assert.deepEqual(original,{enabled:false});
 const removed=toggleObjectField(added,'limit',false,()=>{throw Error('Removal must not create a value');});assert.deepEqual(removed,original);assert.equal(hasObjectField(removed,'limit'),false);
 for(const fields of [original,added,removed]){const doc=screen();doc.root.children[2].events[0]={event:'clicked',action:'configure',args:literal(fields)};assert.deepEqual(decodeScreen(encodeScreen(doc,'optional-literal',caps),caps).root.children[2].events[0].args,literal(fields));}
 const partial={enabled:literal(false)},withLimit=toggleObjectField(partial,'limit',true,()=>createExpression('literal',schema.fields.limit)),withoutLimit=toggleObjectField(withLimit,'limit',false);
 for(const fields of [partial,withLimit,withoutLimit]){const doc=screen();doc.root.children[2].events[0]={event:'clicked',action:'configure',args:{object:fields}};assert.deepEqual(decodeScreen(encodeScreen(doc,'optional-expression',caps),caps).root.children[2].events[0].args,{object:fields});}
 assert.deepEqual(partial,{enabled:literal(false)});
});
test('generic binding forms render data paths, expressions, arrays and objects without App or component special cases',async t=>{
 const root=fileURLToPath(new URL('../frontend',import.meta.url)),server=await createServer({root,configFile:root+'/vite.config.js',server:{middlewareMode:true,hmr:false},logLevel:'silent'});t.after(()=>server.close());
 const {default:Editor}=await server.ssrLoadModule('/src/modules/bindings/BindingEditor.vue'),{default:Expression}=await server.ssrLoadModule('/src/modules/bindings/ExpressionInput.vue'),{default:Data}=await server.ssrLoadModule('/src/modules/bindings/DataValueInput.vue');
 const render=(component,props)=>renderToString(createSSRApp({render:()=>h(component,props)}));
 const html=await render(Editor,{modelValue:screen().root.children[0],family:widgetCatalog(caps).find(w=>w.name==='label'),capabilities:caps});assert.match(html,/Данные и события/);assert.match(html,/pressure/);assert.match(html,/суффикс/);assert.ok(!html.includes('<textarea'));
 const limited={...caps,binding:{...binding,limits:{...binding.limits,bindings:1,expressionDepth:1}}};
 const limitedHtml=await render(Editor,{modelValue:screen().root.children[0],family:widgetCatalog(caps).find(w=>w.name==='label'),capabilities:limited});assert.match(limitedHtml,/disabled aria-label="Добавить привязку"/);assert.ok(!limitedHtml.includes('<option value="op">'));
 const expression=await render(Expression,{modelValue:op('select',comparison,literal('above'),literal('below')),schema:'text',capabilities:caps});assert.match(expression,/Иначе/);assert.match(expression,/источник поле 1/);assert.ok(!expression.includes('<textarea'));
 const indexed=await render(Expression,{modelValue:source('devices',[0,'name']),capabilities:caps});assert.match(indexed,/источник индекс 1/);assert.match(indexed,/источник поле 2/);
 const object=await render(Data,{schema:{type:'object',fields:{enabled:'bool',rows:{type:'array',items:'number',minItems:0,maxItems:3}}},modelValue:{enabled:true,rows:[1.5]}});assert.match(object,/type="checkbox"/);assert.match(object,/value="1.5"/);
 const optionalSchema=binding.actions.find(action=>action.name==='configure').schema,partialValue={enabled:false},partialExpression={object:{enabled:literal(false)}};
 const partialDataHtml=await render(Data,{schema:optionalSchema,modelValue:partialValue});assert.match(partialDataHtml,/Не задано/);assert.match(partialDataHtml,/aria-label="Значение \/ limit задано"/);assert.ok(!partialDataHtml.includes('aria-label="Значение / limit"'));assert.deepEqual(partialValue,{enabled:false});
 const partialExpressionHtml=await render(Expression,{schema:optionalSchema,modelValue:partialExpression,capabilities:caps});assert.match(partialExpressionHtml,/Не задано/);assert.match(partialExpressionHtml,/aria-label="Выражение \/ limit задано"/);assert.ok(!partialExpressionHtml.includes('aria-label="Выражение / limit вид"'));assert.deepEqual(partialExpression,{object:{enabled:literal(false)}});
 assert.deepEqual(createExpression('array',{type:'tuple',items:['integer','bool']}),[literal(0),literal(false)]);
});
test('legacy direct WebSocket enforces its separate limit while project preview uses engine capacity',async t=>{
 function mount(options){const renderer=createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}});let controller;const app=renderer.createApp({setup(){controller=useScreenController(connection,options);return()=>h('div');}});app.mount({});t.after(()=>app.unmount());return controller;}
 const doc=createBlankScreen();doc.root.children=[{id:'long',type:'label',props:{text:'A'.repeat(600)}}];
 const connection={capabilities:ref({...caps,limits:{...caps.limits,screenPacketBytes:32768,screenWebSocketPacketBytes:512}}),httpOnline:ref(true),screenCompatible:ref(true),epoch:ref(0),onReset:()=>()=>{},origin:()=> 'http://device.test:5298',refresh:async()=>{}};
 const options={document:ref(doc),page:ref('screens'),auto:ref(false),simulated:false};
 const direct=mount(options);await direct.sendScreen();assert.match(direct.screenResult.value,/WebSocket/);
 let calls=0;connection.capabilities.value={...connection.capabilities.value,project:{}};const projects=mount({...options,projectPreview:async()=>{calls++;return {nodes:2};}});await projects.sendScreen();assert.equal(calls,1);assert.match(projects.screenResult.value,/не сохранён/);
});
