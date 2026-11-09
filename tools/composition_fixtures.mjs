// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {mkdir,writeFile} from 'node:fs/promises';
import {createProject,encodeProject} from '../packages/project-codec/index.js';
import {createBlankScreen,createNode} from '../frontend/src/screen-model.js';
import {encodeScreen,offlineCapabilities} from '../packages/screen-codec/index.js';
const directory=new URL('../local/composition-fixtures/',import.meta.url);await mkdir(directory,{recursive:true});
const capabilities=offlineCapabilities();
capabilities.binding.sources=[{name:'app.value',writable:false,schema:{type:'integer'}}];
capabilities.binding.actions=[{name:'app.hit',schema:{type:'null'}}];
const page=id=>{const s=createBlankScreen(id,id);s.size={width:320,height:180};
 const text=createNode('label','reading');text.bindings=[{method:'text',value:{source:'app.value'}}];
 const hit=createNode('button','hit');hit.events=[{event:'clicked',action:'app.hit',args:{literal:null}}];s.root.children=[text,hit];return s;};
const pages=['a','b','c','d','e'].map(page);
const shell=createBlankScreen('shell','Composition test');
const slot=createNode('obj','content');slot.style={width:400,height:240,pad_all:0};
slot.view={pages:[{screen:'a',retention:'retain'},...['b','c','d'].map(screen=>({screen,retention:'cache'})),{screen:'e'},
 {screen:'nested',retention:'retain'},{screen:'shell'}],initial:'a',sizing:'fill'};
shell.root.children=[slot,...['a','b','c','d','e','nested','shell'].map(screen=>{const b=createNode('button','go_'+screen);b.events=[{event:'clicked',navigate:{view:'content',screen}}];return b;})];
const nested=createBlankScreen('nested','Nested scoped test');nested.size={width:320,height:180};
const inner=createNode('obj','content');inner.view={pages:[{screen:'a',retention:'cache'},{screen:'b'}],initial:'a',sizing:'design'};
nested.root.children=[inner,...['a','b'].map(screen=>{const b=createNode('button','go_'+screen);b.events=[{event:'clicked',navigate:{view:'content',screen}}];return b;})];
const project=createProject([shell,...pages,nested],{id:'composition',name:'Composition integration'});
await writeFile(new URL('project.cbor',directory),encodeProject(project,capabilities));
for(const s of [shell,...pages,nested])await writeFile(new URL(s.id+'.cbor',directory),encodeScreen(s,'composition',capabilities));
const missing=structuredClone(shell);missing.id='missing';missing.root.children[0].view.pages.push({screen:'absent'});
await writeFile(new URL('missing.cbor',directory),encodeScreen(missing,'missing',capabilities));

// Two independent occurrences of the same nested pages exercise stable ownership paths.
const workspace=createBlankScreen('workspace','Refresh test');
const section=createBlankScreen('section','Section');
const sectionView=createNode('obj','content');
sectionView.view={pages:[{screen:'a'},{screen:'nested'}],initial:'a'};
const sectionButton=createNode('button','open_nested');
sectionButton.events=[{event:'clicked',navigate:{view:'content',screen:'nested'}}];
section.root.children=[sectionView,sectionButton];
workspace.root.children=['left','right'].flatMap(side=>{
 const view=createNode('obj',side);view.view={pages:[{screen:'a'},{screen:'section'}],initial:'a'};
 const button=createNode('button','open_'+side);button.events=[{event:'clicked',navigate:{view:side,screen:'section'}}];
 return [view,button];
});
const refresh=createProject([workspace,section,nested,...pages],{id:'refresh-test',name:'Refresh integration'});
await writeFile(new URL('refresh.cbor',directory),encodeProject(refresh,capabilities));
const edited=structuredClone(refresh);
edited.screens.b.root.children.push(createNode('label','edited'));
await writeFile(new URL('refresh-edited.cbor',directory),encodeProject(edited,capabilities));
const removed=structuredClone(edited);
removed.screens.section.root.children=removed.screens.section.root.children.filter(node=>node.id!=='open_nested');
removed.screens.section.root.children[0].view.pages=[{screen:'a'}];
await writeFile(new URL('refresh-removed.cbor',directory),encodeProject(removed,capabilities));
const renamed=structuredClone(edited);
renamed.screens.nested.root.children[0].id='renamed';
for(const node of renamed.screens.nested.root.children)for(const event of node.events??[])event.navigate.view='renamed';
await writeFile(new URL('refresh-renamed.cbor',directory),encodeProject(renamed,capabilities));
const bad=structuredClone(edited);bad.screens.workspace.size.width=799;
await writeFile(new URL('refresh-invalid.cbor',directory),encodeProject(bad,capabilities));

const noRoot=structuredClone(edited);delete noRoot.screens.workspace;noRoot.manifest.entry='section';
await writeFile(new URL('refresh-no-root.cbor',directory),encodeProject(noRoot,capabilities));
const other=structuredClone(edited);other.manifest.id='other-project';
await writeFile(new URL('refresh-other.cbor',directory),encodeProject(other,capabilities));
