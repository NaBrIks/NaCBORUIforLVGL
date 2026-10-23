import test from 'node:test';import assert from 'node:assert/strict';
import {styleFields,styleGroups} from '../frontend/src/generated/style-fields.js';
import {byName,expandProps,updateProperty,defaultValue,kind} from '../frontend/src/style-model.js';
import {encodeStyle,decodeStyle} from '../packages/style-codec/index.js';
test('all 129 LVGL properties have a typed editor and cover every group',()=>{
 assert.equal(styleFields.length,129);assert.equal(styleGroups.length,19);
 for(const field of styleFields){const method=byName.get(field.name);assert(method,field.name);assert(['number','color','boolean','font','resource','enum','flags'].includes(kind(method)),field.name);}
});
test('editing a single padding edge preserves other values from pad_all',()=>{
 const props=updateProperty({pad_all:18,x:60},'pad_left',7);
 assert.deepEqual(props,{pad_top:18,pad_bottom:18,pad_left:7,pad_right:18,x:60});
 const doc={scope:'screen',name:'test',props};assert.deepEqual(decodeStyle(encodeStyle(doc,'box')).props,props);
});
test('removing a field and expanding size do not leave conflicting setters',()=>{
 const props=updateProperty({size:[420,150],pad_hor:10},'width',undefined);
 assert.equal(props.height,150);assert.equal(props.pad_left,10);assert.equal(props.pad_right,10);assert(!('width' in props));assert(!('size' in props));
 assert.deepEqual(expandProps({margin_all:3,margin_left:8}),{margin_top:3,margin_bottom:3,margin_left:8,margin_right:3});
});
test('every non-resource editor default is representable by the actual codec',()=>{
 for(const field of styleFields){const method=byName.get(field.name);if(kind(method)==='resource')continue;const doc={scope:'screen',name:'test',props:{[field.name]:defaultValue(method)}};assert.doesNotThrow(()=>encodeStyle(doc,'default'),field.name);}
});
