// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {showProjectHome,restoreProjectBase} from '../frontend/src/state/project-recovery.js';
test('showing the home page reads the saved entry without reset or save',async()=>{
 const calls=[],client={async info(){calls.push('info');return{project:{entry:'owner_shell'}};},async show(name){calls.push(['show',name]);}};
 assert.equal(await showProjectHome(client),'owner_shell');assert.deepEqual(calls,['info',['show','owner_shell']]);
});
test('restoring the base uses the confirmed revision and rereads the restored entry',async()=>{
 const calls=[],client={async reset(options){calls.push(['reset',options]);},async info(){calls.push('info');return{project:{entry:'base_shell'}};},async show(name){calls.push(['show',name]);}};
 assert.equal(await restoreProjectBase(client,'reviewed-revision'),'base_shell');assert.deepEqual(calls,[['reset',{revision:'reviewed-revision'}],'info',['show','base_shell']]);
});
test('a rejected reset never replaces the display or retries and an absent revision is refused',async()=>{
 let resets=0;const client={async reset(){resets++;throw Error('Project HTTP 409');},async info(){assert.fail('No show after conflict');}};
 await assert.rejects(()=>restoreProjectBase(client,''),/revision/);assert.equal(resets,0);await assert.rejects(()=>restoreProjectBase(client,'old'),/409/);assert.equal(resets,1);
});
