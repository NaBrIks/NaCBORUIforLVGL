// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode,decode} from 'cborg';
import {createProject,encodeProject,decodeProject,parseProject,serializeProject} from '../packages/project-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
const fresh=()=>createProject([createBlankScreen('main','Main')],{id:'test',name:'Project'});
test('whole project JSON/CBOR roundtrip preserves screens, shared styles and metadata',()=>{
 const project=fresh();project.manifest.description='Test description';project.screens.second=createBlankScreen('second','Second');
 project.styles={derived:{scope:'global',name:'derived',copy:'global:baseStyle',props:{radius:12}},baseStyle:{scope:'global',name:'baseStyle',props:{bg_color:'#123456'}}};
 project.screens.main.root.styles=[{ref:'global:derived'}];
 const bytes=encodeProject(project),wire=decode(bytes,{useMaps:true});assert.deepEqual([...wire.get('styles').keys()],['baseStyle','derived']);
 const canonical=decodeProject(bytes);assert.equal(canonical.screens.second.name,'Second');assert.equal(canonical.manifest.description,'Test description');assert.equal(canonical.styles.derived.attach,false);
 assert.deepEqual(decodeProject(encodeProject(canonical)),canonical);assert.deepEqual(parseProject(serializeProject(project,'json')),project);
});
test('project compiler rejects missing references, identities, cycles and incompatible ABIs',()=>{
 for(const edit of [p=>p.manifest.entry='missing',p=>p.screens.main.id='different',p=>p.manifest.requirements.screenABI='old',p=>p.screens.main.root.styles=[{ref:'global:missing'}],p=>p.styles.x={scope:'screen',name:'x',props:{}},p=>p.styles.x={scope:'global',name:'x',copy:'global:x',props:{}}]){const project=fresh();edit(project);assert.throws(()=>encodeProject(project));}
});
test('malformed project packets never become partially accepted projects',()=>{
 const bytes=encodeProject(fresh()),wire=decode(bytes,{useMaps:true});wire.get('screens').set('main',new Uint8Array([0]));assert.throws(()=>decodeProject(encode(wire)));
 assert.throws(()=>decodeProject(bytes.subarray(0,bytes.length-1)));assert.throws(()=>parseProject('{}'));
});
