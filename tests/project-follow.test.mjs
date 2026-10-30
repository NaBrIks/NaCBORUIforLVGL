// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {ref} from 'vue';
import {useProjectFollow} from '../frontend/src/state/project-follow.js';

function setup(){
 const project=ref({name:'original',size:{width:800,height:480}});let reads=0,replaces=0,resolve;
 const follow=useProjectFollow({project,read:()=>{reads++;return new Promise(done=>resolve=done);},replace:async value=>{replaces++;project.value=value;}});
 return {project,follow,counts:()=>({reads,replaces}),finish:()=>resolve({project:{name:'remote',size:{width:800,height:408}},revision:'v2'})};
}
test('follow starts explicitly, reads only changed revisions and applies external sizes',async()=>{
 const s=setup();await s.follow.update({project:{revision:'v1'}});assert.equal(s.counts().reads,0);
 s.follow.anchor('v1',s.project.value);await s.follow.update({project:{revision:'v1'}});assert.equal(s.counts().reads,0);
 const pending=s.follow.update({project:{revision:'v2'}});await s.follow.update({project:{revision:'v2'}});assert.equal(s.counts().reads,1);
 s.finish();assert.equal(await pending,true);assert.equal(s.project.value.size.height,408);assert.equal(s.follow.revision.value,'v2');assert.equal(s.follow.dirty.value,false);
});
test('local edits block remote replacement; undo resumes, key order does not cause conflicts',async()=>{
 const s=setup();s.follow.anchor('v1',s.project.value);s.project.value.name='owner';await s.follow.update({project:{revision:'v2'}});
 assert.equal(s.follow.conflict.value,true);assert.equal(s.counts().reads,0);assert.equal(s.follow.revision.value,'v1');
 s.project.value={size:{height:480,width:800},name:'original'};assert.equal(s.follow.dirty.value,false);
 const pending=s.follow.update({project:{revision:'v2'}});s.finish();await pending;assert.equal(s.follow.conflict.value,false);
});
test('edits during download and connection resets invalidate pending replacements',async()=>{
 for(const reset of [false,true]){const s=setup();s.follow.anchor('v1',s.project.value);const pending=s.follow.update({project:{revision:'v2'}});
  if(reset)s.follow.reset();else s.project.value.name='edited during read';s.finish();assert.equal(await pending,false);assert.equal(s.counts().replaces,0);assert.equal(s.follow.loading.value,false);
 }
});
test('save baseline uses submitted snapshot, retaining edits made during save as dirty',()=>{
 const s=setup(),submitted=structuredClone(JSON.parse(JSON.stringify(s.project.value)));s.project.value.name='newer';s.follow.anchor('v1',submitted);assert.equal(s.follow.dirty.value,true);
});
