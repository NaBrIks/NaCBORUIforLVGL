// Explicit device acceptance. Changes live screens, then restores the saved entry.
// Never saves project data. Pass the intended device origin explicitly.
import assert from 'node:assert/strict';
import {DeviceClient} from '../integrations/mcp/device.js';
import {createBlankScreen,createNode} from '../frontend/src/screen-model.js';
const origin=process.argv[2];if(!origin)throw Error('Usage: node tools/http_ws_hardware.mjs http://DEVICE');
const client=new DeviceClient(origin,{timeout:15000}),initial=await client.info(),saved=await client.project.info();
const report={before:initial,checks:[],restored:false};
try{
 for(let i=0;i<20;i++){
  const [info,caps,data]=await Promise.all([client.info(),client.capabilities(),client.data.read()]);
  assert.equal(info.boot_id,initial.boot_id);assert.equal(data.diagnostics.bindingErrors,0);
  assert.ok(caps.binding.sources.some(s=>s.name==='system.network'));
 }
 report.checks.push('20 concurrent HTTP rounds: INFO, capabilities, data; stable boot and zero binding errors');
 const style={scope:'screen',name:'transport-check',props:{text_color:'#80dfb0'},attach:true};
 const styleAck=await client.apply('style',style);assert.equal(styleAck.ok,true);
 report.checks.push('style WebSocket CBOR acknowledgement');
 const screen=createBlankScreen('transport-check','Transport acceptance');const label=createNode('label','sample');
 label.props.text='HTTP / WS';screen.root.children=[label];
 const screenAck=await client.apply('screen',screen);assert.equal(screenAck.ok,true);
 const component=new DeviceClient(origin,{timeout:15000,makeSocket:url=>new WebSocket(new URL('/component-ws',url))});
 const componentAck=await component.apply('screen',screen);assert.equal(componentAck.ok,true);
 report.checks.push('screen and component WebSocket CBOR acknowledgements');
 report.after=await client.info();assert.equal(report.after.boot_id,initial.boot_id);
 assert.ok(report.after.tasks.find(t=>t.name==='naw_tcp_http').stack_free>1024);
}finally{
 await client.project.show(saved.project.entry);report.restored=true;
}
console.log(JSON.stringify(report));
