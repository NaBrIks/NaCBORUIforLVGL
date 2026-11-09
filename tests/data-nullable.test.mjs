// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineCapabilities,bindingContract,encodeScreen,decodeScreen,schemasCompatible,inspectExpression,evaluateExpression,UNKNOWN,formatBindingValue} from '../packages/screen-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
const nullableNumber={type:'number',nullable:true},nullableInteger={type:'integer',nullable:true};
const capabilities={...offlineCapabilities(),source:'device'};
capabilities.binding={...capabilities.binding,sha256:bindingContract.sha256,sources:[
 {name:'app.reading',schema:nullableInteger},
 {name:'app.settings',writable:true,schema:{type:'object',fields:{limit:nullableNumber,plain:'number'}}}
],actions:[{name:'app.accept',schema:nullableNumber},{name:'app.clear',schema:'null'}]};
const literal=value=>({literal:value}),source=name=>({source:name}),select=(yes,no)=>({op:'select',args:[literal(true),yes,no]});

test('schema compatibility accepts explicit null only for nullable or null destinations',()=>{
 assert.equal(schemasCompatible('null',nullableNumber),true);
 assert.equal(schemasCompatible('null','null'),true);
 assert.equal(schemasCompatible('null','number'),false);
 assert.equal(schemasCompatible(nullableNumber,'number'),false);
 assert.equal(schemasCompatible(nullableInteger,'integer'),false);
 assert.equal(schemasCompatible('integer',nullableNumber),true);
 assert.equal(schemasCompatible(nullableInteger,nullableNumber),true);
 assert.equal(schemasCompatible(nullableNumber,nullableInteger),false);
 assert.equal(schemasCompatible(undefined,'number'),true,'unknown/offline inference is preserved');
});

test('select combines null and ordinary branches and preserves nullable numeric branches',()=>{
 const inspect=expression=>inspectExpression(expression,{capabilities}).schema;
 assert.deepEqual(inspect(select(literal(null),literal(1.5))),{type:'number',nullable:true});
 assert.deepEqual(inspect(select(literal(2),literal(null))),{type:'integer',nullable:true});
 assert.deepEqual(inspect(select(literal(null),literal(null))),{type:'null'});
 assert.deepEqual(inspect(select(source('app.reading'),literal(1.5))),{type:'number',nullable:true});
 assert.deepEqual(inspect(select(source('app.reading'),literal(2))),{type:'integer',nullable:true});
 assert.deepEqual(inspect(select(literal('a'),literal('b'))),{type:'text'});
});

test('nullable actions and writable fields compile with null while null-only actions stay valid',()=>{
 const screen=createBlankScreen('nullable','Nullable');
 screen.root.children=[{id:'set',type:'button',props:{text:'Set'},events:[{event:'clicked',action:'app.accept',args:literal(null)}]},
  {id:'write',type:'button',props:{text:'Write'},events:[{event:'clicked',write:{source:'app.settings',path:['limit']},value:literal(null)}]},
  {id:'clear',type:'button',props:{text:'Clear'},events:[{event:'clicked',action:'app.clear',args:literal(null)}]}];
 const decoded=decodeScreen(encodeScreen(screen,'nullable',capabilities),capabilities);
 assert.equal(decoded.root.children[0].events[0].args.literal,null);
 assert.equal(decoded.root.children[1].events[0].value.literal,null);
 const wrong=structuredClone(screen);wrong.root.children[1].events[0].write.path=['plain'];assert.throws(()=>encodeScreen(wrong,'bad',capabilities),/Write value type/);
});

test('nullable source cannot bind directly to a nonnullable native setter; text formatting still accepts null',()=>{
 const screen=createBlankScreen('nullable','Nullable');
 screen.root.children=[{id:'bar',type:'bar',props:{},bindings:[{method:'value',value:source('app.reading')}]}];
 assert.throws(()=>encodeScreen(screen,'invalid',capabilities),/Binding method argument type/);
 screen.root.children[0].bindings[0].value=literal(3);assert.doesNotThrow(()=>encodeScreen(screen,'integer',capabilities));
 screen.root.children=[{id:'reading',type:'label',props:{text:'--'},bindings:[{method:'text',value:source('app.reading'),format:{prefix:'Value: ',precision:1}}]}];
 assert.doesNotThrow(()=>encodeScreen(screen,'text',capabilities));
 assert.equal(formatBindingValue(null,{prefix:'Value: ',precision:1}),'Value: null');
});

test('null equality and missing-value semantics remain distinct; ordered literal-null comparisons reject',()=>{
 const equality={op:'eq',args:[source('app.reading'),literal(null)]};
 assert.doesNotThrow(()=>inspectExpression(equality,{capabilities}));
 assert.equal(evaluateExpression(equality,{sources:{'app.reading':null}}),true);
 assert.equal(evaluateExpression(equality,{sources:{'app.reading':3}}),false);
 assert.equal(evaluateExpression(equality,{sources:{}}),UNKNOWN);
 for(const op of ['lt','le','gt','ge'])assert.throws(()=>inspectExpression({op,args:[source('app.reading'),literal(null)]},{capabilities}),/comparison/i);
 assert.equal(evaluateExpression({op:'round',args:[literal(-2.5)]}),-3);
});
