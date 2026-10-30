// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadProject} from '../examples/windows_player/loader.mjs';
import {encodeProject} from '../packages/project-codec/index.js';
import {screenContract} from '../packages/screen-codec/index.js';
import {exampleCapabilities,systemPage} from '../examples/windows_player/system-page.mjs';

const example=new URL('../examples/windows_player/demo.json',import.meta.url);
test('Windows settings demonstrates every standard runtime widget',async()=>{
  const p=JSON.parse(await readFile(example,'utf8')),types=new Set();
  function walk(node){types.add(node.type);for(const child of node.children)walk(child);}
  walk(p.screens.settings.root);
  assert.deepEqual([...types].sort(),screenContract.widgets.filter(w=>!w.retired).map(w=>w.name).sort());
});
test('Windows loader shares JSON/CBOR project compilation and screen dimensions',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'nacborui-loader-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const json=join(dir,'interface.json'),cbor=join(dir,'interface.cbor');
  await writeFile(json,await readFile(example));
  const capabilities=exampleCapabilities();
  const a=await loadProject(json,capabilities);await writeFile(cbor,a.bytes);
  const b=await loadProject(cbor,capabilities);
  assert.deepEqual(b.bytes,a.bytes);assert.equal(a.entry,'shell');
  assert.deepEqual([a.width,a.height],[800,480]);
  assert.deepEqual([b.width,b.height],[800,480]);
  const running=a.project.screens.overview.root.children.find(node=>node.id==='running');
  assert.equal(running.bindings[0].value[0].literal,screenContract.states.CHECKED);
  assert.deepEqual([...(await loadProject(json,capabilities,{entry:'details'})).bytes],
    [...encodeProject(a.project,capabilities)]);
  assert.equal((await loadProject(json,capabilities,{entry:'details'})).height,408);
  await assert.rejects(loadProject(json,capabilities,{entry:'absent'}),/Unknown entry/);
});
test('Windows loader rejects invalid files and actual-target capability mismatches',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'nacborui-loader-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'bad.json');await writeFile(path,'{');
  await assert.rejects(loadProject(path),SyntaxError);
  await writeFile(path,new Uint8Array(2*1024*1024+1));await assert.rejects(loadProject(path),/file size/);
  await writeFile(path,await readFile(example));
  const capabilities=exampleCapabilities();capabilities.source='device';capabilities.binding.sources=[];capabilities.binding.actions=[];
  await assert.rejects(loadProject(path,capabilities),/source|action/i);
  const project=JSON.parse(await readFile(example,'utf8'));project.screens.shell.size={width:5000,height:480};
  await writeFile(path,JSON.stringify(project));await assert.rejects(loadProject(path,exampleCapabilities()),/dimensions|size|width/i);
});

test('System overview compiles bounded core/GPU topology without changing the engine',async()=>{
  const capabilities=exampleCapabilities();
  const p=JSON.parse(await readFile(example,'utf8'));
  for(const [cores,gpus] of [[0,0],[32,2],[64,4]]) {
    p.screens.system=systemPage(cores,gpus);
    assert.ok(encodeProject(p,capabilities).length>0);
    const area=p.screens.system.root.children.find(n=>n.id==='cpu_group').children.find(n=>n.id==='core_area');
    const grid=area.children.find(n=>n.id==='core_grid');
    assert.equal(grid.children.flatMap(row=>row.children).filter(n=>/^core_\d+$/.test(n.id)).length,cores);
    assert.equal(area.flags.SCROLLABLE,true);
    assert.equal(grid.style.min_height,cores?Math.ceil(cores/8)*36-4:0);
  }
  assert.throws(()=>systemPage(65,2),/limits/);
});

test('Windows pages declare responsive LVGL layouts and preserve design dimensions',async()=>{
  const p=JSON.parse(await readFile(example,'utf8'));
  assert.deepEqual(p.screens.shell.size,{width:800,height:480});
  assert.deepEqual(p.screens.shell.root.style.grid_row_dsc_array,[28,{fr:1},44]);
  for(const [name,screen] of Object.entries(p.screens))assert.equal(screen.root.style.layout,name==='system'?'LV_LAYOUT_FLEX':'LV_LAYOUT_GRID');
  const content=p.screens.shell.root.children.find(n=>n.id==='content');
  assert.equal(content.view.sizing,'fill');assert.deepEqual(content.style.width,{pct:100});
  assert.deepEqual([p.screens.system.root.children[0].id,...p.screens.system.root.children[1].children.map(n=>n.id)],
    ['cpu_group','ram_group','gpu_group','gpumem_group']);
  assert.equal(p.screens.system.root.children[1].style.flex_flow,'LV_FLEX_FLOW_ROW');
  assert.equal(p.screens.settings.root.children.find(n=>n.id==='preview').style.grid_cell_column_span,4);
});
