import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveData} from '../frontend/src/state/live-data.js';
import {previewBindings} from '../frontend/src/modules/bindings/preview-bindings.js';
import {offlineCapabilities,widgetCatalog} from '../packages/screen-codec/index.js';
const capabilities={binding:{sources:[{name:'motion',schema:{type:'object',fields:{speed:{type:'number',min:0,max:180},unit:{type:'text',maxBytes:8}}}},{name:'status',schema:{type:'text',maxBytes:32}}]}};
const event=(value,source='motion')=>new Map([['v',1],['event','data_changed'],['source',source],['value',value]]);
const settle=()=>new Promise(done=>setImmediate(done));

test('CBOR events update runtime values; bootstrap never overwrites a newer source event',async()=>{
 let complete,reads=0;const runtime=createLiveData({capabilities:()=>capabilities,read:()=>{reads++;return new Promise(done=>complete=done);}});
 assert.equal(runtime.event(event(new Map([['speed',20],['unit','km/h']]))),false);
 runtime.socketState('online');
 assert.equal(runtime.event(event(new Map([['speed',40],['unit','km/h']]))),true);
 complete({sources:[{name:'motion',state:'known',value:{speed:10,unit:'km/h'}},{name:'status',state:'known',value:'Ready'}]});await settle();
 assert.deepEqual(runtime.sources.find(source=>source.name==='motion').value,{speed:40,unit:'km/h'});
 assert.equal(runtime.sources.find(source=>source.name==='status').value,'Ready');assert.equal(reads,1);
 assert.equal(runtime.event(event({speed:181,unit:'km/h'})),false,'reject catalog range violation');
 assert.equal(runtime.event(event({speed:90,unit:'km/h'},'unregistered')),false,'bounded by actual catalog');
 assert.equal(runtime.event(new Map([['v',1],['event','project_changed']])),false);
 runtime.dispose();
});

test('disconnect invalidates readings; obsolete bootstrap and events cannot cross reset/reconnect',async()=>{
 const pending=[];const runtime=createLiveData({capabilities:()=>capabilities,read:()=>new Promise(done=>pending.push(done))});
 runtime.socketState('online');runtime.event(event({speed:70,unit:'km/h'}));runtime.socketState('backoff');
 assert.deepEqual(runtime.sources,[{name:'motion',state:'stale'}]);assert.equal(runtime.event(event({speed:100,unit:'km/h'})),false);
 runtime.socketState('online');pending[0]({sources:[{name:'motion',state:'known',value:{speed:2,unit:'km/h'}}]});await settle();
 assert.equal(runtime.sources[0].state,'stale');
 pending[1]({sources:[{name:'motion',state:'known',value:{speed:30,unit:'km/h'}}]});await settle();assert.equal(runtime.sources[0].value.speed,30);
 runtime.reset();assert.deepEqual(runtime.sources,[]);assert.equal(runtime.event(event({speed:120,unit:'km/h'})),false);
 runtime.dispose();runtime.socketState('online');assert.equal(pending.length,2);
});

test('preview uses shared expression/format rules without changing authoring or unknown numeric targets',()=>{
 const label={type:'label',props:{text:'Draft'},bindings:[{method:'text',value:{source:'motion',path:['speed']},format:{precision:1,suffix:' km/h',unknown:'--'}}]};
 const before=structuredClone(label),family=widgetCatalog(offlineCapabilities()).find(item=>item.name==='label');
 assert.equal(previewBindings(label,[{name:'motion',state:'known',value:{speed:42.25}}],family).content.text,'42.3 km/h');
 assert.equal(previewBindings(label,[{name:'motion',state:'stale',value:{speed:50}}],family).content.text,'--');
 assert.deepEqual(label,before);
 const native={type:'custom:meter',props:{reading:[0,'km/h']},bindings:[{method:'reading',value:[{op:'round',args:[{source:'motion',path:['speed']}]},{literal:'km/h'}]}]};
 const meter={methods:[{alias:'reading',parameters:['int32_t','text']}]};
 assert.deepEqual(previewBindings(native,[],meter).content.reading,[0,'km/h']);
 const bound=previewBindings(native,[{name:'motion',state:'known',value:{speed:53.6}}],meter);
 assert.deepEqual(bound.content.reading,[54,'km/h']);assert.equal(bound.bindings[0].text,'[54,"km/h"]');
 assert.equal(previewBindings({...native,bindings:[{method:'other',value:{literal:99}}]},[],meter).bindings.length,0);
});
