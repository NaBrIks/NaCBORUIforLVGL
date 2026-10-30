// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeScreen,decodeScreen,screenContract} from '../packages/screen-codec/index.js';
import {validateDataValue} from '../packages/screen-codec/binding-schema.js';
import {capabilities} from '../examples/s3_style_lab/project/demo.mjs';
import {appendShell,demoShellOptions,systemBindingCatalog,withSystemBindings} from '../examples/s3_style_lab/project/shell.mjs';

test('demo shell preserves all author pages/styles and declares explicit generic view policies',async()=>{
 const original=JSON.parse(await readFile(new URL('../examples/s3_style_lab/project/preserved-project.json',import.meta.url),'utf8'));
 const before=structuredClone(original),project=appendShell(original,demoShellOptions),shell=project.screens.shell;
 assert.deepEqual(original,before);assert.equal(project.manifest.entry,'shell');
 assert.deepEqual(project.styles,before.styles);
 for(const [name,page] of Object.entries(before.screens))assert.deepEqual(project.screens[name],page);
 const {entry:oldEntry,...oldManifest}=before.manifest,{entry:newEntry,...newManifest}=project.manifest;
 assert.deepEqual(newManifest,oldManifest);
 assert.equal(shell.theme,'none');const content=shell.root.children.find(node=>node.id==='content');
 assert.equal(content.view.sizing,'design');assert.equal(content.view.initial,'dashboard');
 assert.equal(content.style.height,408);assert.equal(content.flags.SCROLLABLE,true);
 assert.deepEqual(content.view.pages.map(page=>page.screen),Object.keys(before.screens));
 assert.equal(content.view.pages.find(page=>page.screen==='radar').retention,'cache');
 const nav=shell.root.children.find(node=>node.id==='navigation').children;
 assert.equal(nav.reduce((sum,node)=>sum+node.style.width,0),800);
 assert.ok(nav.every(node=>node.style.height===44&&node.events[0].navigate.view==='content'));
 assert.deepEqual(nav.map(node=>node.events[0].navigate.screen),Object.keys(before.screens));
 project.screens.shell.name='Owner shell edit';assert.deepEqual(appendShell(project,demoShellOptions),project);
});
test('shell compiles system bindings and local navigation without native or page-specific editor code',async()=>{
 const source=JSON.parse(await readFile(new URL('../examples/s3_style_lab/project/preserved-project.json',import.meta.url),'utf8'));
 const shell=appendShell(source,demoShellOptions).screens.shell;
 const caps={...capabilities,source:'simulator',binding:withSystemBindings(capabilities.binding)};
 const bytes=encodeScreen(shell,'demo-shell',caps),back=decodeScreen(bytes,caps);
 assert.ok(bytes.length<screenContract.limits.packetBytes);
 assert.deepEqual(back.root.children.find(node=>node.id==='content').view,shell.root.children.find(node=>node.id==='content').view);
 const status=back.root.children.find(node=>node.id==='statusbar').children;
 assert.deepEqual(status.find(node=>node.id==='system-time').bindings[0].value,{source:'system.clock',path:['localTime']});
 assert.deepEqual(status.find(node=>node.id==='system-ip').bindings[0].value,{source:'system.network',path:['ip']});
});
test('system schemas retain unknown clock/IP fields until service observations arrive',()=>{
 const schema=name=>systemBindingCatalog.sources.find(source=>source.name===name).schema;
 validateDataValue({connected:false},schema('system.network'));
 validateDataValue({connected:true,ip:'192.0.2.1'},schema('system.network'));
 validateDataValue({syncState:'unsynced',timezone:'YEKT-5',error:''},schema('system.clock'));
 validateDataValue({syncState:'holdover',timezone:'YEKT-5',localTime:'12:34:56',unixSeconds:1792730096,
  lastSyncAgeSeconds:61,error:''},schema('system.clock'));
 assert.throws(()=>validateDataValue({connected:'yes'},schema('system.network')));
 assert.throws(()=>validateDataValue({localTime:'123456789'},schema('system.clock')));
});
