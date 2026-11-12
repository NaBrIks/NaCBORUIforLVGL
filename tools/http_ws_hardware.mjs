// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Explicit device acceptance. Changes live screens, then restores the saved entry.
// Never saves project data. Pass the intended device origin explicitly.
import assert from 'node:assert/strict';
import {ProjectClient} from '../packages/project-codec/client.js';
import {DataClient} from '../packages/project-codec/data-client.js';
import {readDeviceJson,applyDeviceDocument} from './device_acceptance.mjs';
import {createBlankScreen,createNode} from '../frontend/src/screen-model.js';
const origin=process.argv[2];if(!origin)throw Error('Usage: node tools/http_ws_hardware.mjs http://DEVICE');
const projectClient=new ProjectClient(origin),dataClient=new DataClient(origin),initial=await readDeviceJson(origin,'/api/info'),saved=await projectClient.info();
const capabilities=await readDeviceJson(origin,'/api/capabilities');
const report={before:initial,checks:[],restored:false};
try{
 for(let i=0;i<20;i++){
  const [info,caps,data]=await Promise.all([readDeviceJson(origin,'/api/info'),readDeviceJson(origin,'/api/capabilities'),dataClient.read()]);
  assert.equal(info.boot_id,initial.boot_id);assert.equal(data.diagnostics.bindingErrors,0);
  assert.ok(caps.binding.sources.some(s=>s.name==='system.network'));
 }
 report.checks.push('20 concurrent HTTP rounds: INFO, capabilities, data; stable boot and zero binding errors');
 const style={scope:'screen',name:'transport-check',props:{text_color:'#80dfb0'},attach:true};
 const styleAck=await applyDeviceDocument(origin,'style',style,capabilities);assert.equal(styleAck.ok,true);
 report.checks.push('style WebSocket CBOR acknowledgement');
 const screen=createBlankScreen('transport-check','Transport acceptance');const label=createNode('label','sample');
 label.props.text='HTTP / WS';screen.root.children=[label];
 const screenAck=await applyDeviceDocument(origin,'screen',screen,capabilities);assert.equal(screenAck.ok,true);
 const componentAck=await applyDeviceDocument(origin,'screen',screen,capabilities,'/component-ws');assert.equal(componentAck.ok,true);
 report.checks.push('screen and component WebSocket CBOR acknowledgements');
 report.after=await readDeviceJson(origin,'/api/info');assert.equal(report.after.boot_id,initial.boot_id);
 assert.ok(report.after.tasks.find(t=>t.name==='naw_tcp_http').stack_free>1024);
}finally{
 await projectClient.show(saved.project.entry);report.restored=true;
}
console.log(JSON.stringify(report));
