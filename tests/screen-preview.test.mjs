// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScreen,createNode,validateScreen,flattenNodes,findNode,nextId,removeNode,moveNode,parseTracks} from '../frontend/src/screen-model.js';
import {previewStyle,resolvedStyle,unsupportedProperties} from '../frontend/src/preview-style.js';

test('screen draft and generated example validate; duplicate IDs and invalid borrowed arrays are rejected',async()=>{
 const doc=createScreen();assert.deepEqual(validateScreen(doc),[]);
 const example=JSON.parse(await readFile(new URL('../contracts/screens/example.screen.json',import.meta.url),'utf8'));
 assert.deepEqual(example,doc);assert.deepEqual(validateScreen(example),[]);
 const bad=structuredClone(doc);bad.root.children[0].id='root';bad.root.style.grid_column_dsc_array=[{fr:0}];
 assert.ok(validateScreen(bad).some(e=>e.includes('Duplicate node ID')));bad.root.children[0].id='title';assert.ok(validateScreen(bad).some(e=>e.includes('Grid fraction')));delete bad.root.style.grid_column_dsc_array;
 bad.root.styles={ref:'screen:foo'};assert.ok(validateScreen(bad).some(e=>e.includes('Style uses array')));
});
test('tree operations preserve sibling order and stable identity',()=>{
 const doc=createScreen();const original=doc.root.children.map(c=>c.id);
 assert.equal(moveNode(doc.root,'title',1),true);assert.deepEqual(doc.root.children.map(c=>c.id),[...original].reverse());
 const id=nextId(doc,'label');doc.root.children.push(createNode('label',id));assert.equal(findNode(doc,id).id,id);
 assert.equal(removeNode(doc.root,id),true);assert.equal(findNode(doc,id),undefined);assert.equal(flattenNodes(doc.root).length,5);
});
test('pixel, percent, min/max, border, outline and both shadow mechanisms remain independent',()=>{
 const node={type:'obj',style:{width:{pct:50},height:80,min_width:100,max_width:300,border_width:2,border_color:'#ff0000',outline_width:3,outline_pad:4,outline_color:'#00ff00',shadow_width:20,shadow_offset_x:8,drop_shadow_opa:128,drop_shadow_radius:4}};
 const css=previewStyle(node);assert.equal(css.width,'50%');assert.equal(css.minWidth,'100px');assert.equal(css.maxWidth,'300px');
 assert.equal(css.borderWidth,'2px');assert.equal(css.outlineWidth,'3px');assert.equal(css.outlineOffset,'4px');assert.match(css.boxShadow,/8px 0px 10px/);assert.match(css.filter,/drop-shadow/);
 assert.equal(previewStyle({type:'obj',style:{drop_shadow_radius:8}}).filter,undefined);
});
test('Flex flows and Grid tracks/cells translate without browser flex shrink',()=>{
 const flex=previewStyle({type:'obj',style:{layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN_WRAP_REVERSE',pad_row:12}});
 assert.equal(flex.display,'flex');assert.equal(flex.flexDirection,'column-reverse');assert.equal(flex.flexWrap,'wrap');assert.equal(flex.rowGap,'12px');assert.equal(flex.flexShrink,0);
 const grid=previewStyle({type:'obj',style:{layout:'LV_LAYOUT_GRID',grid_column_dsc_array:parseTracks('120, 1fr, content')}});
 assert.equal(grid.gridTemplateColumns,'120px minmax(0, 1fr) max-content');
 const cell=previewStyle({type:'obj',style:{grid_cell_column_pos:1,grid_cell_column_span:2,grid_cell_x_align:'LV_GRID_ALIGN_STRETCH'}},{parentLayout:'LV_LAYOUT_GRID'});
 assert.equal(cell.gridColumn,'2 / span 2');assert.equal(cell.width,'auto');
 assert.throws(()=>parseTracks('banana'));assert.throws(()=>parseTracks('0fr'));
});
test('screen MAIN styles resolve in attachment order, then local overrides; unsupported values remain explicit',()=>{
 const screen={styles:{a:{props:{bg_color:'#000000',width:10}},b:{props:{width:20}}}};
 const node={type:'obj',styles:[{ref:'screen:a'},{ref:'screen:b'},{ref:'screen:b',part:'INDICATOR'}],style:{width:30,anim_duration:100}};
 assert.equal(resolvedStyle(node,screen).width,30);assert.equal(resolvedStyle(node,screen).bg_color,'#000000');
 assert.deepEqual(unsupportedProperties(node,screen),['anim_duration']);
});
test('pinned non-style reference includes exact native property operations and lifecycle APIs',async()=>{
 const data=JSON.parse(await readFile(new URL('../docs/widget_api_lvgl_9_6.data.json',import.meta.url),'utf8'));
 assert.equal(data.lvgl,'9.6.0');assert.equal(new Set(data.functions.map(f=>f.name)).size,data.functions.length);
 const text=data.properties.find(p=>p.id==='LV_PROPERTY_LABEL_TEXT');assert.equal(text.setter,'lv_label_set_text');assert.equal(text.getter,'lv_label_get_text');assert.equal(text.access,'R/W');
 for(const name of ['lv_obj_create','lv_obj_delete','lv_obj_set_property','lv_label_set_text','lv_slider_set_range','lv_screen_load'])assert.ok(data.functions.some(f=>f.name===name),name);
 assert.ok(!data.functions.some(f=>/^lv_style_set_|^lv_obj_set_style_/.test(f.name)));
 assert.ok(data.sources.length>=90);assert.ok(data.properties.length>200);assert.ok(!data.properties.some(p=>p.family==='style'));
});
