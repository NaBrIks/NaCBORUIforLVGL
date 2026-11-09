// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {assistantInstructions,assistantGuideVersion,readAssistantGuide} from '../tools/designer/prompts/guide.mjs';
import {serializeDocument,parseDocument} from '../packages/document-io/index.js';
import {authoringCatalog} from '../packages/document-io/ui-reference.js';
import {screenContract} from '../packages/screen-codec/contract.js';
import {contract} from '../packages/style-codec/contract.js';
import {normalizeProperties} from '../packages/style-codec/index.js';
import {encodeWidgetMethod} from '../packages/screen-codec/widget-methods.js';
import {offlineCapabilities} from '../packages/screen-codec/index.js';
import {readUiReference} from '../integrations/mcp/ui-reference.js';

test('Agent grid example has four real controls, attached/local color and validated reverse bindings',async()=>{
 const docs=[...assistantInstructions.matchAll(/```json\s*([\s\S]*?)```/g)].map(m=>JSON.parse(m[1])),document=docs.find(d=>d.format),style=docs.find(d=>d.scope);
 assert.deepEqual(document,JSON.parse(await readFile('examples/screens/agent-grid-controls.json','utf8')));
 const caps=offlineCapabilities();Object.assign(caps,{source:'device',binding:{...caps.binding,sources:[{name:'example.enabled',schema:'bool',writable:true},{name:'example.number_text',schema:'text',writable:true}],actions:[{name:'example.apply',schema:'null'},{name:'example.reset',schema:'null'}]}});
 const bytes=serializeDocument('screen',document,'cbor',{capabilities:caps}),restored=parseDocument('screen',bytes,{capabilities:caps});
 assert.deepEqual(restored.root.children.map(n=>n.type),['button','button','checkbox','textarea']);assert.equal(restored.root.children[0].props.text,'Apply');
 assert.equal(document.root.style.layout,'LV_LAYOUT_GRID');assert.equal(document.root.style.grid_column_dsc_array.length,2);assert.equal(document.root.style.grid_row_dsc_array.length,2);
 assert.equal(document.root.children[0].styles.length,2);assert.ok(document.root.children[1].style.bg_color);assert.equal(restored.root.children[2].events[0].event,'value_changed');assert.equal(restored.root.children[3].bindings[0].method,'text');
 const restoredStyle=parseDocument('style',serializeDocument('style',style,'cbor'));assert.equal(restoredStyle.name,'accent');assert.equal(restoredStyle.props.radius,6);
 caps.binding.sources[0].writable=false;assert.throws(()=>serializeDocument('screen',document,'cbor',{capabilities:caps}),/writ|read.only/i);
 assert.ok(assistantGuideVersion);assert.equal(readAssistantGuide().references.length,2);assert.equal(readAssistantGuide().language,'en');assert.doesNotMatch(assistantInstructions,/[А-Яа-яЁё]/);const russian=readAssistantGuide({language:'ru'});assert.ok(russian.references.every(r=>r.name.endsWith('.ru.md')));assert.deepEqual([...russian.instructions.matchAll(/```json\s*([\s\S]*?)```/g)].map(m=>JSON.parse(m[1])),docs,'both translations preserve the real JSON example');assert.doesNotMatch(assistantInstructions,/CBOR|opcode|signature|sha256/i);assert.match(assistantInstructions,/https:\/\/docs\.lvgl\.io\//);
});

test('Full authoring references cover every supported method with examples accepted by the actual codecs',async()=>{
 const catalog=authoringCatalog();assert.equal(catalog.styles.length,contract.methods.filter(m=>!m.retired).length);assert.equal(catalog.widgets.length,screenContract.widgets.length);
 for(const m of catalog.styles){normalizeProperties(m.example.style);const entry=await readUiReference({kind:'style',topic:m.name});assert.match(entry.markdown,new RegExp(m.lvgl));}
 for(const [group,reference]of [[screenContract.common,catalog.common],...screenContract.widgets.map((w,i)=>[w,catalog.widgets[i]])]){
  assert.equal(reference.methods.length,group.methods.filter(m=>!m.retired).length);
  for(const m of reference.methods){const value=m.example.props?.[m.name]??m.example.common?.[m.name];encodeWidgetMethod(group,m.name,m.name==='options'?value.join('\n'):value);}
 }
 for(const kind of ['screen','style']){const index=await readUiReference({kind,topic:'index'});for(const topic of index.topics){const entry=await readUiReference({kind,topic});assert.ok(Buffer.byteLength(JSON.stringify(entry))<16384,'reference topic fits agent tool budget: '+topic);assert.doesNotMatch(entry.markdown,/opcode|signature|sha256/i);}}
 const checked=spawnSync(process.execPath,['tools/assistant_reference.mjs','--check'],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);
});
