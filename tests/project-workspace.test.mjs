// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,h,ref,nextTick,computed} from 'vue';
import {useProjectWorkspace} from '../frontend/src/state/project-workspace.js';
import {useScreenWorkspace} from '../frontend/src/state/screen-workspace.js';
import {useProjectController} from '../frontend/src/state/project-controller.js';
import {useStyleController} from '../frontend/src/state/style-controller.js';
import {useScreenController} from '../frontend/src/state/screen-controller.js';
import {createProject,recompileProjectAuthoring,parseProject,encodeProject} from '../packages/project-codec/index.js';
import {parseDocument} from '../packages/document-io/index.js';
import {screenContract} from '../packages/screen-codec/index.js';
import {offlineCapabilities} from '../packages/screen-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
import {decode} from 'cborg';
function mount(t,setup){const renderer=createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}});let value;const app=renderer.createApp({setup(){value=setup();return()=>h('div');}});app.mount({});t.after(()=>app.unmount());return value;}

test('project startup page is selected initially and after replacement even when listed last',async t=>{
 const p=createProject([createBlankScreen('details','Details'),createBlankScreen('shell','Shell')]);p.manifest.entry='shell';
 const values=new Map([['lvgl-cbor-project-1',JSON.stringify(p)]]);globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const project=mount(t,()=>useProjectWorkspace(ref(null)));
 const screens=mount(t,()=>useScreenWorkspace(ref(null),{documents:project.screenDocuments,entry:computed(()=>project.project.value.manifest.entry)}));
 assert.equal(screens.current.value.id,'shell');screens.screenId.value='details';await nextTick();
 await project.replace(p,'MCU');assert.equal(screens.current.value.id,'shell');assert.equal(screens.selected.value,p.screens.shell.root.id);
 project.project.value.manifest.entry='details';await nextTick();assert.equal(screens.current.value.id,'shell','editing startup does not interrupt current editing');
 await project.replace(project.project.value,'File');assert.equal(screens.current.value.id,'details');
});
test('one project owns screen/style editing, rename references and project replacement',async t=>{
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const workspace=mount(t,()=>useProjectWorkspace(ref(null))),p=createProject([createBlankScreen('main','Main')],{styles:{accent:{scope:'global',name:'accent',props:{text_color:'#ffffff'}}}});
 p.screens.main.root.styles=[{ref:'global:accent'}];await workspace.replace(p,'File');
 workspace.project.value.screens.main.styles.local={copy:'global:accent',props:{}};
 assert.equal(workspace.screenDocuments.value[0].id,'main');workspace.styleDoc.value={...workspace.styleDoc.value,name:'renamed'};
 assert.equal(workspace.project.value.screens.main.root.styles[0].ref,'global:renamed');assert.equal(workspace.project.value.styles.accent,undefined);
 assert.equal(workspace.project.value.screens.main.styles.local.copy,'global:renamed');
 assert.equal(workspace.removeStyle('renamed'),false);const duplicate=workspace.duplicateStyle('renamed');assert.equal(workspace.project.value.styles[duplicate].props.text_color,'#ffffff');assert.equal(workspace.removeStyle(duplicate),true);
 workspace.screenDocuments.value[0].name='Changed screen';await nextTick();assert.equal(workspace.project.value.screens.main.name,'Changed screen');
 assert.equal(JSON.parse(values.get('lvgl-cbor-project-1')).screens.main.name,'Changed screen');
 const added=workspace.addStyle();await nextTick();assert.ok(JSON.parse(values.get('lvgl-cbor-project-1')).styles[added]);
 workspace.styleDoc.value={...workspace.styleDoc.value,name:'new_name',props:{pad_all:8}};await nextTick();assert.equal(JSON.parse(values.get('lvgl-cbor-project-1')).styles.new_name.props.pad_all,8);
});

test('external refresh preserves selected screen/node and style, with fallback on removal',async t=>{
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const project=mount(t,()=>useProjectWorkspace(ref(null)));
 const screens=mount(t,()=>useScreenWorkspace(ref(null),{documents:project.screenDocuments,entry:computed(()=>project.project.value.manifest.entry),preserveSelection:project.preserveSelection}));
 const p=createProject([createBlankScreen('details','Details'),createBlankScreen('shell','Shell')],{styles:{first:{scope:'global',name:'first',props:{}},second:{scope:'global',name:'second',props:{}}}});p.manifest.entry='shell';
 p.screens.details.root.children.push({id:'selected-label',type:'label',props:{text:'Selected'},style:{},children:[]});
 await project.replace(p,'MCU');screens.screenId.value='details';await nextTick();screens.selected.value='selected-label';project.styleId.value='second';
 p.screens.details.size.height=408;await project.replace(p,'Refresh',{preserveSelection:true});assert.equal(screens.current.value.id,'details');assert.equal(screens.current.value.size.height,408);assert.equal(screens.selected.value,'selected-label');assert.equal(project.styleId.value,'second');
 p.screens.details.root.children=[];await project.replace(p,'Refresh',{preserveSelection:true});assert.equal(screens.selected.value,p.screens.details.root.id);
 delete p.screens.details;delete p.styles.second;await project.replace(p,'Refresh',{preserveSelection:true});assert.equal(screens.current.value.id,'shell');assert.equal(screens.selected.value,p.screens.shell.root.id);assert.equal(project.styleId.value,'first');
});
test('current alias JSON recompiles old screen fingerprints transactionally and preserves the browser original',t=>{
 const original=createProject([createBlankScreen('owner','Owner edits')]);original.manifest.name='Owner project';original.manifest.requirements.screenABI='f'.repeat(64);original.screens.owner.root.props={};
 const before=structuredClone(original),result=recompileProjectAuthoring(original);assert.equal(result.migrated,true);assert.equal(result.project.manifest.requirements.screenABI,screenContract.sha256);assert.deepEqual(original,before);
 let notices=0;const parsed=parseProject(JSON.stringify(original),{format:'json',onRecompile:()=>notices++});assert.equal(notices,1);assert.equal(parsed.manifest.name,'Owner project');assert.doesNotThrow(()=>encodeProject(parsed));
 assert.deepEqual(parseDocument('project',JSON.stringify(original)).screens,original.screens);
 const values=new Map([['lvgl-cbor-project-1',JSON.stringify(original)]]);globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const workspace=mount(t,()=>useProjectWorkspace(ref(null)));assert.equal(workspace.project.value.manifest.requirements.screenABI,screenContract.sha256);assert.match(workspace.warning.value,/перекомпилирован/);assert.deepEqual(JSON.parse(values.get('lvgl-cbor-project-1-before-contract-recompile')),original);assert.deepEqual(JSON.parse(values.get('lvgl-cbor-project-1')),original);
 const invalid=structuredClone(original);invalid.screens.owner.root.props={unsupported:1};assert.throws(()=>recompileProjectAuthoring(invalid));assert.equal(invalid.manifest.requirements.screenABI,'f'.repeat(64));
 values.set('lvgl-cbor-project-1',JSON.stringify(invalid));mount(t,()=>useProjectWorkspace(ref(null)));assert.deepEqual(JSON.parse(values.get('lvgl-cbor-project-1-before-contract-recompile')),invalid);
 const foreignStyle=structuredClone(original);foreignStyle.manifest.requirements.styleABI='a'.repeat(64);assert.throws(()=>recompileProjectAuthoring(foreignStyle),/ABI/);
});
test('connecting retrieves project status without any write',async t=>{
 const old=globalThis.fetch;let writes=0;globalThis.fetch=async(url,options)=>{if(options.method!=='GET')writes++;return new Response(JSON.stringify({format:'lvgl-project-service-1',storage:{writable:true,persistent:false},project:{revision:'v1'}}));};t.after(()=>globalThis.fetch=old);
 const connection={ready:ref(true),capabilities:ref({project:{format:'lvgl-project-service-1'}}),epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:()=>()=>{}};
 const workspace={project:ref(createProject([createBlankScreen()])),replace:async()=>{}};
 mount(t,()=>useProjectController(connection,workspace,{}));await nextTick();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);
});

test('home command shows the current saved entry and preserves a different local draft',async t=>{
 const old=globalThis.fetch,commands=[];globalThis.fetch=async(url,options)=>{const action=new URL(url).searchParams.get('action');if(options.method==='POST'){commands.push({action,body:decode(options.body)});return new Response(JSON.stringify({ok:true,saved:false}));}return new Response(JSON.stringify({project:{revision:'saved',entry:'shell'},storage:{writable:true}}));};t.after(()=>globalThis.fetch=old);
 const connection={ready:ref(true),capabilities:ref({project:{format:'lvgl-project-service-1'}}),epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:()=>()=>{}};
 const project=createProject([createBlankScreen('unsaved','Local draft')]),workspace={project:ref(project),replace:async()=>assert.fail('Home must not replace the local project')};
 const controller=mount(t,()=>useProjectController(connection,workspace,{}));await controller.showSaved();
 assert.deepEqual(commands,[{action:'show',body:{screen:'shell'}}]);assert.equal(workspace.project.value.manifest.entry,'unsaved');assert.match(controller.projectMessage.value,/shell/);
});

test('WS events and reconnect follow revisions without project polling, preview/write or losing a dirty draft',async t=>{
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 let remote=createProject([createBlankScreen('details','Details'),createBlankScreen('shell','Shell')]),revision='v1',writes=0,reads=0,previews=0,holdRead=null;remote.manifest.entry='shell';
 const old=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(options.method!=='GET')writes++;if(new URL(url).searchParams.get('action')==='read'){reads++;const bytes=encodeProject(remote),version=revision,wait=holdRead;holdRead=null;if(wait)await wait;return new Response(bytes,{headers:{'X-Project-Revision':version}});}return new Response(JSON.stringify({project:{revision},storage:{writable:true}}));};t.after(()=>globalThis.fetch=old);
 const caps={...offlineCapabilities(),project:{format:'lvgl-project-service-1',events:['project_changed']}},resets=new Set();
 const connection={ready:ref(true),httpOnline:ref(true),screenCompatible:ref(true),capabilities:ref(caps),epoch:ref(0),origin:()=> 'http://device.test:5299',onReset:fn=>{resets.add(fn);return()=>resets.delete(fn);},refresh:async()=>true};
 const workspace=mount(t,()=>useProjectWorkspace(ref(caps)));
 const screens=mount(t,()=>useScreenWorkspace(ref(caps),{documents:workspace.screenDocuments,entry:computed(()=>workspace.project.value.manifest.entry),preserveSelection:workspace.preserveSelection}));
 const controller=mount(t,()=>useProjectController(connection,workspace,{}));
 mount(t,()=>useScreenController(connection,{document:screens.current,page:ref('screens'),auto:ref(true),simulated:false,projectPreview:async()=>{previews++;},suspended:workspace.loading}));
 const settle=async()=>{await nextTick();await new Promise(done=>setImmediate(done));await nextTick();};
 await settle();assert.equal(reads,0);await controller.openDevice();assert.equal(controller.following.value,true);assert.equal(controller.projectDirty.value,false);screens.screenId.value='details';await settle();
 const priorPreviews=previews;remote.screens.details.size.height=408;revision='v2';connection.capabilities.value={...caps};await settle();assert.equal(controller.deviceRevision.value,'v1','connection heartbeat does not poll project');
 controller.projectChanged(new Map([['event','project_changed'],['revision','v2']]));await settle();
 assert.equal(controller.deviceRevision.value,'v2');assert.equal(screens.current.value.id,'details');assert.equal(screens.current.value.size.height,408);assert.equal(previews,priorPreviews);assert.equal(writes,0);
 remote.screens.details.size.height=406;revision='v3';controller.socketOnline();await settle();assert.equal(screens.current.value.size.height,406);assert.equal(controller.deviceRevision.value,'v3');
 let release;holdRead=new Promise(done=>release=done);remote.screens.details.size.height=404;revision='v4';controller.projectChanged(new Map([['event','project_changed'],['revision','v4']]));await settle();
 remote.screens.details.size.height=402;revision='v5';controller.projectChanged(new Map([['event','project_changed'],['revision','v5']]));release();await settle();await settle();assert.equal(controller.deviceRevision.value,'v5');assert.equal(screens.current.value.size.height,402,'event during download is not lost');
 workspace.project.value.manifest.name='Local edits';await settle();remote.manifest.name='MCP update';revision='v6';controller.projectChanged(new Map([['event','project_changed'],['revision','v6']]));await settle();
 assert.equal(controller.projectConflict.value,true);assert.equal(workspace.project.value.manifest.name,'Local edits');assert.equal(controller.deviceRevision.value,'v5');
 controller.stopFollowing();assert.equal(controller.following.value,false);
});

test('connection/reconnection and project opening stay passive with auto enabled; actual edits and manual preview still work',async t=>{
 const old=globalThis.WebSocket,sockets=[];let previews=0;
 globalThis.WebSocket=class{constructor(){this.readyState=0;sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}send(){throw Error('Unexpected legacy write');}close(){this.readyState=3;}};t.after(()=>globalThis.WebSocket=old);
 const document=ref({scope:'global',name:'accent',props:{text_color:'#ffffff'}}),auto=ref(true),suspended=ref(false),ready=ref(false),epoch=ref(0),page=ref('styles');
 const preview={componentType:ref('label'),componentText:ref('Text'),componentSize:ref({width:800,height:480}),componentDocument:()=>{throw Error('Unexpected legacy component creation');}};
 const connection={ready,epoch,capabilities:ref({project:{format:'lvgl-project-service-1'}}),info:ref({component_preview:true}),origin:()=> 'http://device.test:5299',onReset:()=>()=>{},refresh:async()=>{}};
 const controller=mount(t,()=>useStyleController(connection,{document,page,auto,preview,suspended,projectPreview:async()=>{previews++;return {nodes:1};}}));
 const settle=async()=>{await nextTick();await new Promise(resolve=>setImmediate(resolve));};
 ready.value=true;await settle();assert.equal(previews,0);assert.equal(controller.canApply.value,true);
 sockets[0].onopen();await settle();assert.equal(previews,0);
 suspended.value=true;document.value={...document.value,props:{text_color:'#123456'}};await settle();assert.equal(previews,0);suspended.value=false;
 document.value.props.text_color='#654321';await settle();assert.equal(previews,1);
 auto.value=false;preview.componentText.value='Another text';await settle();assert.equal(previews,1);
 await controller.send();assert.equal(previews,2);
});
