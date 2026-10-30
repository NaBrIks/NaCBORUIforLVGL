// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,h,ref,nextTick,computed} from 'vue';
import {createProject,encodeProject} from '../packages/project-codec/index.js';
import {offlineCapabilities} from '../packages/screen-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
import {pagePreviewTargets,buildPagePreview} from '../frontend/src/modules/composition/page-preview.js';
import {useScreenController} from '../frontend/src/state/screen-controller.js';
import {usePagePreview} from '../frontend/src/state/page-preview.js';
import {useProjectWorkspace} from '../frontend/src/state/project-workspace.js';
import {useScreenWorkspace} from '../frontend/src/state/screen-workspace.js';

function mount(t,setup){const renderer=createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}});let value;const app=renderer.createApp({setup(){value=setup();return()=>h('div');}});app.mount({});t.after(()=>app.unmount());return value;}
const settle=async()=>{await nextTick();await new Promise(done=>setImmediate(done));await nextTick();};
function fixture(){
 const p=createProject(['shell','middle','leaf','other'].map(id=>createBlankScreen(id,id)));
 const view=(initial,pages)=>({initial,pages:pages.map(screen=>({screen,retention:'cache'})),sizing:'design'});
 p.screens.shell.root.children=[{id:'content',type:'obj',style:{width:800,height:408},view:view('other',['middle','other'])},{id:'sidebar',type:'obj',view:view('leaf',['leaf'])}];
 p.screens.middle.root.view=view('leaf',['leaf']);p.screens.leaf.size={width:800,height:408};return p;
}

test('preview uses actual parent paths, selects every ancestor and preserves source project',()=>{
 const p=fixture(),before=structuredClone(p),targets=pagePreviewTargets(p,'leaf');
 assert.equal(targets.length,3);assert.equal(targets[0].key,'standalone');
 const nested=targets.find(item=>item.path.length===2),plan=buildPagePreview(p,'leaf',nested);
 assert.deepEqual(plan.path,['content','root']);assert.equal(plan.screen,'shell');
 assert.equal(plan.project.screens.shell.root.children[0].view.initial,'middle');
 assert.equal(plan.project.screens.middle.root.view.initial,'leaf');
 assert.equal(plan.project.screens.shell.root.children[0].view.pages[0].retention,'cache');
 assert.doesNotThrow(()=>encodeProject(plan.project));assert.deepEqual(p,before);
 assert.equal(buildPagePreview(p,'leaf',targets[0]).screen,'leaf');
});

test('standalone MCU preview frames design size inside the physical display without changing saved entry',()=>{
 const p=fixture(),before=structuredClone(p),plan=buildPagePreview(p,'leaf',null,{width:800,height:480});
 assert.notEqual(plan.screen,'leaf');assert.equal(plan.project.manifest.entry,'shell');
 const frame=plan.project.screens[plan.screen];assert.deepEqual(frame.size,{width:800,height:480});
 assert.equal(frame.root.view.initial,'leaf');assert.equal(frame.root.view.sizing,'design');
 assert.deepEqual(plan.project.screens.leaf.size,{width:800,height:408});assert.doesNotThrow(()=>encodeProject(plan.project));assert.deepEqual(p,before);
 assert.equal(buildPagePreview(p,'shell',null,{width:800,height:480}).screen,'shell');
});

test('detached hosts remain available and navigation cycles terminate',()=>{
 const p=fixture();p.manifest.entry='other';assert.equal(pagePreviewTargets(p,'leaf').length,3);
 p.screens.leaf.root.view={initial:'other',pages:[{screen:'other'},{screen:'shell'}],sizing:'fill'};
 p.manifest.entry='shell';assert.ok(pagePreviewTargets(p,'leaf').length<=33);
 const target=pagePreviewTargets(p,'leaf').find(item=>item.path.length===2);delete p.screens.middle.root.view;
 assert.throws(()=>buildPagePreview(p,'leaf',target),/Место вставки/);
});

test('page selection, preview mode and external reload are passive; edits and explicit showing send',async t=>{
 const project=ref(fixture()),id=ref('shell'),document=computed(()=>project.value.screens[id.value]),auto=ref(true),page=ref('screens'),suspended=ref(false),capabilities=ref({...offlineCapabilities(),project:{format:'lvgl-project-service-1'},display:{width:800,height:480}});
 const preview=mount(t,()=>usePagePreview(project,document,capabilities)),sent=[];
 const connection={httpOnline:ref(true),screenCompatible:ref(true),capabilities,epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:()=>()=>{}};
 const controller=mount(t,()=>useScreenController(connection,{document,page,auto,suspended,previewKey:preview.target,projectPreview:async()=>{sent.push(preview.device());return {nodes:1};}}));
 await settle();id.value='leaf';await settle();assert.equal(sent.length,0);
 preview.target.value=preview.targets.value.find(item=>item.path.length===2).key;await settle();assert.equal(sent.length,0);
 document.value.name='Edited';await settle();assert.equal(sent.length,1);assert.equal(sent[0].screen,'shell');
 suspended.value=true;document.value.name='External';await settle();suspended.value=false;assert.equal(sent.length,1);
 id.value='middle';await settle();assert.equal(preview.target.value,'standalone');assert.equal(sent.length,1);
 auto.value=false;document.value.name='Manual';await settle();assert.equal(sent.length,1);
 await controller.sendScreen();assert.equal(sent.length,2);assert.equal(sent[1].screen,'middle');
 page.value='project';auto.value=true;document.value.name='Hidden';await settle();page.value='screens';await settle();assert.equal(sent.length,2);
});

test('leaving a page cancels queued edits rather than sending the newly selected page',async t=>{
 const document=ref(createBlankScreen('a','A')),page=ref('screens'),auto=ref(true);let release,sends=0;
 const pending=new Promise(done=>release=done),connection={httpOnline:ref(true),screenCompatible:ref(true),capabilities:ref({project:{}}),epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:()=>()=>{}};
 mount(t,()=>useScreenController(connection,{document,page,auto,projectPreview:async()=>{sends++;await pending;return {nodes:1};}}));
 document.value.name='A1';await settle();document.value.name='A2';await settle();assert.equal(sends,1);
 document.value=createBlankScreen('b','B');await settle();release();await settle();assert.equal(sends,1);
 document.value.name='B1';await settle();assert.equal(sends,2);
});

test('editor document replacement is an edit, not a page selection',async t=>{
 globalThis.localStorage={getItem:()=>null,setItem(){}};
 const caps=ref({...offlineCapabilities(),project:{}}),project=mount(t,()=>useProjectWorkspace(caps));
 await project.replace(fixture(),'test');
 const screens=mount(t,()=>useScreenWorkspace(caps,{documents:project.screenDocuments,entry:computed(()=>project.project.value.manifest.entry)}));
 const preview=mount(t,()=>usePagePreview(project.project,screens.current,caps));let sends=0;
 const connection={httpOnline:ref(true),screenCompatible:ref(true),capabilities:caps,epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:()=>()=>{}};
 mount(t,()=>useScreenController(connection,{document:screens.current,page:ref('screens'),auto:ref(true),suspended:project.loading,previewKey:preview.target,projectPreview:async()=>{sends++;return {nodes:1};}}));
 screens.screenId.value='leaf';await settle();assert.equal(sends,0);
 screens.update({...screens.current.value,size:{width:800,height:406}});await settle();
 assert.equal(screens.current.value.id,'leaf');assert.equal(sends,1);
});

test('external same-page reload cancels pending auto edits while an earlier preview finishes',async t=>{
 const document=ref(createBlankScreen('a','A')),suspended=ref(false);let sends=0,release;
 const pending=new Promise(done=>release=done),connection={httpOnline:ref(true),screenCompatible:ref(true),capabilities:ref({project:{}}),epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:()=>()=>{}};
 mount(t,()=>useScreenController(connection,{document,page:ref('screens'),auto:ref(true),suspended,projectPreview:async()=>{sends++;await pending;return {nodes:1};}}));
 document.value.name='A1';await settle();document.value.name='A2';await settle();
 suspended.value=true;document.value=createBlankScreen('a','Remote');await settle();suspended.value=false;release();await settle();
 assert.equal(sends,1);
});
