// Explicit real-device acceptance; no project saves or firmware changes.
import assert from 'node:assert/strict';
import {decodePacket} from '../packages/style-codec/index.js';
import {DeviceClient} from '../integrations/mcp/device.js';
const origin=process.argv[2];if(!origin)throw Error('Usage: node tools/data_events_hardware.mjs http://DEVICE');
const client=new DeviceClient(origin,{timeout:15000});
const before=await client.info(),project=await client.project.info(),frames=[];
const url=new URL('/ws',origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
const socket=new WebSocket(url);socket.binaryType='arraybuffer';
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WS timeout')),5000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(Error('WS error'));};});
socket.onmessage=event=>{const frame=decodePacket(new Uint8Array(event.data));if(frame.get('event')==='data_changed')frames.push(frame);};
await new Promise(resolve=>setTimeout(resolve,4200));socket.close();
const speeds=frames.filter(frame=>frame.get('source')==='demo.speed');
assert.ok(speeds.length>=20,'live speed events');
let previous;
for(const frame of speeds){
 assert.equal(frame.get('state'),'known');const value=frame.get('value'),kmh=value.get('kmh'),sequence=value.get('sequence');
 assert.ok(kmh>=0&&kmh<=180);assert.equal(value.get('unit'),'km/h');
 if(previous){assert.ok(sequence>previous.sequence);assert.ok(Math.abs(kmh-previous.kmh)<(sequence-previous.sequence)+0.01,'smooth source trajectory');}
 previous={kmh,sequence};
}
assert.ok(speeds.some(frame=>!Number.isInteger(frame.get('value').get('kmh'))),'fractional needle input');
assert.ok(frames.some(frame=>frame.get('source')==='system.clock'),'clock events');
const snapshot=await client.data.read(),seq=snapshot.sources.find(source=>source.name==='demo.speed').value.sequence;
await new Promise(resolve=>setTimeout(resolve,800));
const latest=await client.data.read(),after=await client.info(),current=await client.project.info();
assert.ok(latest.sources.find(source=>source.name==='demo.speed').value.sequence>=seq+15,'producer continues after socket close');
assert.equal(after.boot_id,before.boot_id);assert.equal(latest.diagnostics.bindingErrors,0);
assert.equal(current.project.revision,project.project.revision);
console.log(JSON.stringify({boot:after.boot_id,speedEvents:speeds.length,first:speeds[0].get('value'),last:speeds.at(-1).get('value'),sources:[...new Set(frames.map(frame=>frame.get('source')))],autonomous:true,diagnostics:latest.diagnostics},(_,value)=>value instanceof Map?Object.fromEntries(value):value));
