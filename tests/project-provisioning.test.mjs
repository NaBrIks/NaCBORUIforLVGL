// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeScreen,screenContract} from '../packages/screen-codec/index.js';
import {contract} from '../packages/style-codec/index.js';
import {baseProject,storageProject,capabilities} from '../examples/s3_style_lab/project/demo.mjs';
import {prepareProvisioningProject,prepareStockProject,provisioningCapabilities} from '../examples/s3_style_lab/project/provision.mjs';
import {compileCatalog,inspectCatalog} from '../packages/project-codec/catalog.js';
test('complete project JSON provisioning preserves identities, edits and styles while recompiling fingerprints',()=>{
 const original=structuredClone(storageProject);original.manifest.name='Owner project';original.manifest.description='Owner text';
 original.manifest.requirements={screenABI:'old',styleABI:'old'};original.screens.dashboard.root.children[0].props.text='Owner edit';
 const before=structuredClone(original),next=prepareProvisioningProject(original);
 assert.deepEqual(original,before);assert.equal(next.manifest.id,before.manifest.id);assert.equal(next.manifest.name,'Owner project');
 assert.equal(next.manifest.entry,before.manifest.entry);assert.equal(next.manifest.description,'Owner text');
 assert.deepEqual(next.styles,before.styles);
 for(const [name,screen] of Object.entries(before.screens))assert.deepEqual(next.screens[name],screen);
 assert.deepEqual(next.manifest.requirements,{screenABI:screenContract.sha256,styleABI:contract.sha256});
 const {files}=compileCatalog(baseProject,next,{...capabilities,binding:capabilities.binding});inspectCatalog(files.get('catalog.0'),files);
});
test('exported owner project keeps all four screen packets and six authoring styles',async()=>{
 const original=JSON.parse(await readFile(new URL('../examples/s3_style_lab/project/preserved-project.json',import.meta.url),'utf8'));
 const next=prepareProvisioningProject(original),caps={...capabilities,binding:capabilities.binding};
 assert.equal(Object.keys(original.screens).length,4);assert.equal(Object.keys(original.styles).length,6);
 const {requirements:oldFingerprint,...oldManifest}=original.manifest,{requirements:newFingerprint,...newManifest}=next.manifest;
 assert.deepEqual(newManifest,oldManifest);assert.deepEqual(next.styles,original.styles);
 for(const [name,screen] of Object.entries(original.screens))
  assert.deepEqual(encodeScreen(next.screens[name],'preserved-owner',caps),encodeScreen(screen,'preserved-owner',caps),name);
 const {files}=compileCatalog(baseProject,next,caps);inspectCatalog(files.get('catalog.0'),files);
});

test('stock RGB S3 catalog switches complete interfaces and preserves Setup',()=>{
 const project=prepareStockProject(storageProject),caps=provisioningCapabilities(capabilities);
 assert.equal(project.manifest.entry,'interface-select');
 const [view,toCockpit,toClassic]=project.screens['interface-select'].root.children;
 assert.equal(view.view.initial,'shell');
 assert.deepEqual(view.view.pages.map(page=>page.screen),['shell','cockpit']);
 assert.equal(toCockpit.style.x,toClassic.style.x);
 assert.equal(toCockpit.style.y,toClassic.style.y);
 assert.deepEqual([toCockpit,toClassic].map(node=>node.events[0].navigate),
  [{view:'interface',screen:'cockpit'},{view:'interface',screen:'shell'}]);
 const pressure=project.screens.cockpit.root.children.find(node=>node.id==='pressure');
 assert.deepEqual(pressure.children.find(node=>node.id==='readouts').view.pages.map(page=>page.screen),
  ['cockpit-lcd','cockpit-led']);
 const {root}=project.screens.shell;
 assert.deepEqual(root.children.find(node=>node.id==='content').view.pages.map(page=>page.screen),['dashboard','radar','trip','setup']);
 const controls=project.screens.setup.root.children;
 for(const action of ['ui.select_scheme','ui.display_mode','ui.display_buffers','ui.display_transfer','ui.display_restart'])
  assert.ok(controls.some(node=>node.events?.some(event=>event.action===action)),action);
 const {files}=compileCatalog(baseProject,project,caps);
 inspectCatalog(files.get('catalog.0'),files);
});
