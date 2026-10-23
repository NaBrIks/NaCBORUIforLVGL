import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeScreen,decodeScreen,screenContract} from '../packages/screen-codec/index.js';
import {contract} from '../packages/style-codec/index.js';
import {baseProject,storageProject,capabilities} from '../examples/s3_style_lab/project/demo.mjs';
import {createScannerScreen,scannerBindingCatalog,appendScanner} from '../examples/s3_style_lab/project/ble_scanner.mjs';
import {prepareProvisioningProject} from '../examples/s3_style_lab/project/provision.mjs';
import {compileCatalog,inspectCatalog} from '../packages/project-codec/catalog.js';
test('scanner uses ordinary components, indexed array bindings and confirmed-state write/action events',()=>{
 const caps={...capabilities,source:'simulator',binding:scannerBindingCatalog},screen=createScannerScreen();
 const bytes=encodeScreen(screen,'scanner-test',caps),decoded=decodeScreen(bytes,caps);
 assert.ok(bytes.length<screenContract.limits.packetBytes);assert.ok(bytes.length>3584);
 const nodes=decoded.root.children;
 assert.ok(nodes.every(node=>['label','button','switch'].includes(node.type)));
 assert.deepEqual(nodes.find(node=>node.id==='ble-name-7').bindings[0].value.args[2],{source:'ble.scan.devices',path:[7,'name']});
 assert.deepEqual(nodes.find(node=>node.id==='ble-scan').events[0],{event:'value_changed',write:{source:'ble.scan.enabled',path:[]},value:{event:'value'}});
 assert.deepEqual(nodes.find(node=>node.id==='ble-clear').events[0].args,{literal:null});
});
test('scanner switch remains visible without a theme in both confirmed states',()=>{
 const caps={...capabilities,source:'simulator',binding:scannerBindingCatalog},screen=createScannerScreen();
 assert.equal(screen.theme,'none');
 const decoded=decodeScreen(encodeScreen(screen,'scanner-visible-switch',caps),caps);
 const toggle=decoded.root.children.find(node=>node.id==='ble-scan');
 const effective=(part,checked)=>Object.assign({},...toggle.styleRules.filter(rule=>rule.part===part&&
  (!rule.state.length||(checked&&rule.state.every(state=>state==='CHECKED')))).map(rule=>rule.props));
 for(const checked of [false,true]){
  const main=effective('MAIN',checked),indicator=effective('INDICATOR',checked),knob=effective('KNOB',checked);
  assert.equal(main.bg_opa,255);assert.equal(indicator.bg_opa,255);assert.equal(knob.bg_opa,255);
  assert.ok(main.border_width>0);assert.ok(main.radius>0);assert.ok(knob.radius>0);
  assert.notEqual(knob.bg_color,indicator.bg_color,'knob contrasts with its track');
  assert.ok(toggle.style.height+2*knob.pad_all>0,'knob padding leaves a visible handle');
 }
 assert.notEqual(effective('INDICATOR',false).bg_color,effective('INDICATOR',true).bg_color,'checked selector changes track color');
 assert.equal(toggle.bindings[0].scope,'common');
 assert.equal(toggle.bindings[0].value[0].literal,screenContract.states.CHECKED);
});
test('complete project JSON provisioning preserves identities, edits and styles while recompiling fingerprints',()=>{
 const original=structuredClone(storageProject);original.manifest.name='Owner project';original.manifest.description='Owner text';
 original.manifest.requirements={screenABI:'old',styleABI:'old'};original.screens.dashboard.root.children[0].props.text='Owner edit';
 const before=structuredClone(original),next=prepareProvisioningProject(original,{scanner:true});
 assert.deepEqual(original,before);assert.equal(next.manifest.id,before.manifest.id);assert.equal(next.manifest.name,'Owner project');
 assert.equal(next.manifest.entry,before.manifest.entry);assert.equal(next.manifest.description,'Owner text');
 assert.deepEqual(next.styles,before.styles);
 for(const [name,screen] of Object.entries(before.screens))assert.deepEqual(next.screens[name],screen);
 assert.deepEqual(next.manifest.requirements,{screenABI:screenContract.sha256,styleABI:contract.sha256});
 const {files}=compileCatalog(baseProject,next,{...capabilities,binding:scannerBindingCatalog});inspectCatalog(files.get('catalog.0'),files);
 next.screens['ble-scanner'].name='Owner scanner edit';assert.equal(appendScanner(next).screens['ble-scanner'].name,'Owner scanner edit');
});
test('exported owner project keeps all four screen packets and six authoring styles',async()=>{
 const original=JSON.parse(await readFile(new URL('../examples/s3_style_lab/project/preserved-project.json',import.meta.url),'utf8'));
 const next=prepareProvisioningProject(original,{scanner:true}),caps={...capabilities,binding:scannerBindingCatalog};
 assert.equal(Object.keys(original.screens).length,4);assert.equal(Object.keys(original.styles).length,6);
 const {requirements:oldFingerprint,...oldManifest}=original.manifest,{requirements:newFingerprint,...newManifest}=next.manifest;
 assert.deepEqual(newManifest,oldManifest);assert.deepEqual(next.styles,original.styles);
 for(const [name,screen] of Object.entries(original.screens))
  assert.deepEqual(encodeScreen(next.screens[name],'preserved-owner',caps),encodeScreen(screen,'preserved-owner',caps),name);
 const {files}=compileCatalog(baseProject,next,caps);inspectCatalog(files.get('catalog.0'),files);
});
