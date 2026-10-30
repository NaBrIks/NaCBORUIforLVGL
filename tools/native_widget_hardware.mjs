// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {DeviceClient} from '../integrations/mcp/device.js';
import {encodeScreen,decodeScreen,widgetCatalog} from '@lvgl-cbor/screen-codec';
import {nativeDemo,extensions} from '../examples/native_widget/demo-screen.mjs';
const origin=process.argv[2];if(!origin)throw Error('Usage: node tools/native_widget_hardware.mjs http://DEVICE');
const client=new DeviceClient(origin,{timeout:10000}),before=await client.info(),caps=await client.capabilities();
assert.deepEqual(caps.extensions,extensions);assert.equal(widgetCatalog(caps).filter(w=>w.abi).length,3);
const acknowledgements=[];
for(let index=0;index<24;++index){
 const doc=structuredClone(nativeDemo),[,pump,gauge,radar]=doc.root.children;
 pump.props.state=index%4;
 gauge.props.range=[0,240];gauge.props.redline=180;gauge.props.reading=[index*10,'km/h'];
 radar.props.running=index%2===0;radar.props.sweep=(index*17)%360;
 radar.props.targets=Array.from({length:index%9},(_,i)=>['T'+(i+1),(index*11+i*45)%360,(index*7+i*13)%101,(index*3+i*17)%101]);
 const canonical=decodeScreen(encodeScreen(doc,'roundtrip',caps),caps);
 assert.deepEqual(decodeScreen(encodeScreen(canonical,'second',caps),caps),canonical);
 const ack=await client.apply('screen',doc);assert.equal(ack.nodes,5);acknowledgements.push(ack);
}
const final=await client.apply('screen',nativeDemo),after=await client.info();
assert.equal(after.boot_id,before.boot_id,'no reset during native execution');
assert.ok(after.screen_applied>=before.screen_applied+25);
await writeFile('local/native-widgets-hardware.json',JSON.stringify({origin,before,after,extensions:caps.extensions,variants:acknowledgements,final},null,2));
console.log(JSON.stringify({boot_id:after.boot_id,variants:24,final,nativeComponents:3,noReset:true}));
