import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../packages/project-codec/index.js';
import {compileCatalog,inspectCatalog} from '../packages/project-codec/catalog.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
import {baseProject,storageProject,capabilities} from '../examples/s3_style_lab/project/demo.mjs';
test('directory catalog stores only changed independent documents and checks their contents',()=>{
 const base=createProject([createBlankScreen('main','Main')]),next=structuredClone(base);next.screens.extra=createBlankScreen('extra','Extra');
 const {files,index}=compileCatalog(base,next);assert.deepEqual([...files.keys()],['0s000.cbor','catalog.0']);assert.equal(index.screens.get('extra').file,'0s000.cbor');
 const decoded=inspectCatalog(files.get('catalog.0'),files);assert.deepEqual(decoded.get('screenOrder'),['main','extra']);
 const corrupt=new Map(files);corrupt.set('0s000.cbor',Uint8Array.of(0));assert.throws(()=>inspectCatalog(files.get('catalog.0'),corrupt),/document/);
 const torn=files.get('catalog.0').slice();torn[torn.length-1]^=1;assert.throws(()=>inspectCatalog(torn,files),/checksum/);
});
test('catalog records explicit removals and separate styles; every filename fits flat SPIFFS',()=>{
 const base=createProject([createBlankScreen('main','Main'),createBlankScreen('old','Old')]);const next=structuredClone(base);delete next.screens.old;
 next.styles.reading={scope:'global',name:'reading',props:{text_color:'#22cc88'}};
 const {files,index}=compileCatalog(base,next);assert.equal(index.screens.get('old'),null);assert.equal(index.styles.get('reading').file,'0t000.cbor');
 for(const name of files.keys())assert.ok(name.length<=10&&!name.includes('/'));inspectCatalog(files.get('catalog.0'),files);
});
test('TPMS/GPS ROM project and filesystem additions compile against native component contracts',()=>{
 const {files,index}=compileCatalog(baseProject,storageProject,capabilities);inspectCatalog(files.get('catalog.0'),files);
 assert.deepEqual(index.screenOrder,['dashboard','radar','trip']);assert.deepEqual([...index.screens.keys()],['radar','trip']);
 const tires=baseProject.screens.dashboard.root.children.filter(n=>/^(front|rear)_/.test(n.id));assert.equal(tires.length,4);
 assert.equal(baseProject.screens.dashboard.root.children.find(n=>n.id==='gps_speed').type,'lab:speedometer');
});
