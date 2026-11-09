// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationMode} from '../frontend/src/state/app-route.js';

test('graphics native profile opens the studio at editor and root routes',()=>{
 for(const pathname of ['/','/index.html','/editor','/editor/'])
  assert.equal(applicationMode({pathname,profile:'graphics'}),'studio');
});
test('manual project editing and simulator retain the common editor',()=>{
 for(const profile of ['graphics','system',null,undefined]){
  assert.equal(applicationMode({pathname:'/editor/',search:'?mode=manual',profile}),'editor');
  assert.equal(applicationMode({pathname:'/editor/',search:'?sim=1',profile}),'editor');
 }
});
test('system, MCU and offline origins keep the common editor',()=>{
 for(const profile of ['system','device',null])
  assert.equal(applicationMode({pathname:'/editor/',profile}),'editor');
 assert.equal(applicationMode({pathname:'/editor/'}),'loading');
});
test('live viewer remains independent of the editing profile',()=>{
 for(const pathname of ['/viewer','/viewer/'])for(const profile of ['graphics','system',null,undefined])
  assert.equal(applicationMode({pathname,profile}),'viewer');
});
test('an unrelated path is handled by the common editor not-found page',()=>{
 assert.equal(applicationMode({pathname:'/unknown',profile:'graphics'}),'editor');
});
