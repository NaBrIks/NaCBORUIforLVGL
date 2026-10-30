// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {compileSchemes,roleStyles,contrast} from '../examples/windows_player/schemes.mjs';
import {decodeProject,encodeProject} from '../packages/project-codec/index.js';

test('Windows schemes use the standard palettes and the existing project/style codecs',async()=>{
  const compiled=await compileSchemes(),project=decodeProject(compiled.bytes);
  assert.equal(compiled.default,'cream');
  assert.deepEqual(compiled.choices.map(c=>c.name),['Светлая','Кремовая','Изумрудная','Тёмная']);
  assert.deepEqual(encodeProject(project),compiled.bytes);
  for(const [id,color] of Object.entries({light:'#ffffff',cream:'#fdfbf7',emerald:'#0f1714',dark:'#1e1e1e'})) {
    assert.equal(project.styles[id+'.canvas'].props.bg_color,color);
  }
  assert.equal(Object.keys(project.styles).length,60);
});
test('Scheme text remains readable in normal and pressed button states',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../examples/windows_player/schemes.json',import.meta.url),'utf8'));
  for(const scheme of Object.values(catalog.schemes)) {
    const roles=roleStyles(scheme);
    assert.ok(contrast(scheme.canvas,scheme.text)>=4.5,scheme.name);
    assert.ok(contrast(scheme.bar,scheme.barText)>=4.5,scheme.name+' status');
    assert.ok(contrast(scheme.primary,roles.button.text_color)>=4.5,scheme.name+' button');
    assert.ok(contrast(scheme.hover,roles.button_pressed.text_color)>=4.5,scheme.name+' pressed');
  }
});
test('Invalid appearance catalog is rejected before native application',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'nacborui-schemes-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'schemes.json');
  const catalog=JSON.parse(await readFile(new URL('../examples/windows_player/schemes.json',import.meta.url),'utf8'));
  catalog.schemes.cream.primary='red';await writeFile(file,JSON.stringify(catalog));
  await assert.rejects(compileSchemes(file),/Scheme color/);
  catalog.schemes.cream.primary='#e18f2f';catalog.default='missing';await writeFile(file,JSON.stringify(catalog));
  await assert.rejects(compileSchemes(file),/default/);
});
