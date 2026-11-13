// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {writeFile,mkdir} from 'node:fs/promises';
import {contract} from '../packages/style-codec/contract.js';
import {screenContract} from '../packages/screen-codec/contract.js';
import {SCREEN_FORMAT,createScreen,widgetTypes} from '../frontend/src/screen-model.js';
const root=new URL('../',import.meta.url);
const styleNames=[...new Set(contract.methods.flatMap(m=>[...m.properties,...(m.parameters.length===1?[m.alias]:[])]))].sort();
const selector={type:'object',required:['props'],properties:{part:{type:'string',default:'MAIN'},state:{type:'array',items:{type:'string'},uniqueItems:true},props:{$ref:'#/$defs/style'}},additionalProperties:false};
const schema={
 '$schema':'https://json-schema.org/draft/2020-12/schema',title:'lvgl-cbor: экран, черновик 1',description:'Формат браузерного редактора; не wire-контракт существующей прошивки.',
 type:'object',required:['format','id','name','size','root'],additionalProperties:false,
 properties:{format:{const:SCREEN_FORMAT},id:{type:'string',minLength:1},name:{type:'string',minLength:1},theme:{enum:['device','none']},bindings:{type:'array',maxItems:0},size:{type:'object',required:['width','height'],properties:{width:{type:'integer',minimum:1,maximum:8192},height:{type:'integer',minimum:1,maximum:8192}},additionalProperties:false},styles:{type:'object',additionalProperties:{type:'object',required:['props'],properties:{props:{$ref:'#/$defs/style'}},additionalProperties:false}},root:{$ref:'#/$defs/node'}},
 '$defs':{
  dimension:{oneOf:[{type:'integer'},{const:'content'},{type:'object',required:['pct'],properties:{pct:{type:'integer',minimum:-contract.valueRules.dimension.pctMax,maximum:contract.valueRules.dimension.pctMax}},additionalProperties:false}]},
  track:{oneOf:[{type:'integer',minimum:0,maximum:contract.valueRules.grid.maxPixels},{const:'content'},{type:'object',required:['fr'],properties:{fr:{type:'integer',minimum:1,maximum:100}},additionalProperties:false}]},
  style:{type:'object',propertyNames:{enum:styleNames},additionalProperties:{type:['number','string','boolean']},properties:Object.fromEntries([...['width','height','min_width','min_height','max_width','max_height','x','y'].map(k=>[k,{$ref:'#/$defs/dimension'}]),...['grid_column_dsc_array','grid_row_dsc_array'].map(k=>[k,{type:'array',minItems:1,maxItems:64,items:{$ref:'#/$defs/track'}}])])},
  styleRule:selector,
  node:{type:'object',required:['id','type'],additionalProperties:false,properties:{id:{type:'string',minLength:1},type:{enum:widgetTypes},bindings:{type:'array',maxItems:0},common:{type:'object',propertyNames:{enum:screenContract.common.methods.map(m=>m.alias)},additionalProperties:{type:['integer','boolean','string','array']}},props:{type:'object',description:'Параметры конкретного виджета; подробнее в readme_screen_model.ru.md',properties:{text:{type:'string'},src:{type:'string'},min:{type:'number'},max:{type:'number'},value:{type:'number'},checked:{type:'boolean'},one_line:{type:'boolean'},password_mode:{type:'boolean'},max_length:{type:'integer',minimum:0},max_lines:{type:'integer',minimum:0},long_mode:{type:'integer'},start_value:{type:'integer'},scale:{type:'integer'},rotation:{type:'integer'},mode:{type:'integer'},direction:{type:'integer'},angles:{type:'array',items:{type:'number'},minItems:2,maxItems:2},bg_angles:{type:'array',items:{type:'number'},minItems:2,maxItems:2},options:{type:'array',items:{type:'string'}},selected:{type:'integer',minimum:0},points:{type:'array',items:{type:'array',prefixItems:[{type:'number'},{type:'number'}],minItems:2,maxItems:2}}},additionalProperties:false},style:{$ref:'#/$defs/style'},styles:{type:'array',items:{type:'object',required:['ref'],properties:{ref:{type:'string'},part:{type:'string',default:'MAIN'},state:{type:'array',items:{type:'string'}}},additionalProperties:false}},styleRules:{type:'array',items:{$ref:'#/$defs/styleRule'}},flags:{type:'object',additionalProperties:{type:'boolean'}},children:{type:'array',items:{$ref:'#/$defs/node'},maxItems:screenContract.limits.nodes}}}
 }
};
await mkdir(new URL('contracts/screens/',root),{recursive:true});
await writeFile(new URL('contracts/screens/screen-draft-1.schema.json',root),JSON.stringify(schema,null,2)+'\n');
await writeFile(new URL('contracts/screens/example.screen.json',root),JSON.stringify(createScreen(),null,2)+'\n');
console.log('Screen draft schema and example generated; no style ABI files changed.');
