import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadProject} from '../examples/windows_player/loader.mjs';
import {encodeProject} from '../packages/project-codec/index.js';
import {offlineCapabilities,screenContract} from '../packages/screen-codec/index.js';

const example=new URL('../examples/windows_player/demo.json',import.meta.url);
test('Windows loader shares JSON/CBOR project compilation and screen dimensions',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'nacborui-loader-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const json=join(dir,'interface.json'),cbor=join(dir,'interface.cbor');
  await writeFile(json,await readFile(example));
  const a=await loadProject(json);await writeFile(cbor,a.bytes);
  const b=await loadProject(cbor);
  assert.deepEqual(b.bytes,a.bytes);assert.equal(a.entry,'shell');
  assert.deepEqual([a.width,a.height],[800,480]);
  assert.deepEqual([b.width,b.height],[800,480]);
  const running=a.project.screens.overview.root.children.find(node=>node.id==='running');
  assert.equal(running.bindings[0].value[0].literal,screenContract.states.CHECKED);
  assert.deepEqual([...(await loadProject(json,undefined,{entry:'details'})).bytes],
    [...encodeProject(a.project)]);
  assert.equal((await loadProject(json,undefined,{entry:'details'})).height,408);
  await assert.rejects(loadProject(json,undefined,{entry:'absent'}),/Unknown entry/);
});
test('Windows loader rejects invalid files and actual-target capability mismatches',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'nacborui-loader-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'bad.json');await writeFile(path,'{');
  await assert.rejects(loadProject(path),SyntaxError);
  await writeFile(path,new Uint8Array(2*1024*1024+1));await assert.rejects(loadProject(path),/file size/);
  await writeFile(path,await readFile(example));
  const capabilities=offlineCapabilities();capabilities.source='device';capabilities.binding.sources=[];capabilities.binding.actions=[];
  await assert.rejects(loadProject(path,capabilities),/source|action/i);
  const project=JSON.parse(await readFile(example,'utf8'));project.screens.shell.size={width:5000,height:480};
  await writeFile(path,JSON.stringify(project));await assert.rejects(loadProject(path),/dimensions|size|width/i);
});
