// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {compileSchemes,roleStyles,contrast} from '../examples/common/appearance/schemes.mjs';
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
  const catalog=JSON.parse(await readFile(new URL('../examples/common/appearance/schemes.json',import.meta.url),'utf8'));
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
  const catalog=JSON.parse(await readFile(new URL('../examples/common/appearance/schemes.json',import.meta.url),'utf8'));
  catalog.schemes.cream.primary='red';await writeFile(file,JSON.stringify(catalog));
  await assert.rejects(compileSchemes(file),/Scheme color/);
  catalog.schemes.cream.primary='#e18f2f';catalog.default='missing';await writeFile(file,JSON.stringify(catalog));
  await assert.rejects(compileSchemes(file),/default/);
});

test('registry presets vary geometry through shared style props and keep readable palettes',async()=>{
 const path=new URL('../examples/windows_player/registry-schemes.json',import.meta.url),catalog=JSON.parse(await readFile(path,'utf8'));
 const project=decodeProject((await compileSchemes(path)).bytes);
 assert.deepEqual(Object.values(catalog.schemes).map(p=>p.name),['Строгая классика','Космическое будущее','Розовый пони']);
 assert.equal(project.styles['classic.button'].props.radius,0);assert.equal(project.styles['space.button'].props.border_width,1);assert.equal(project.styles['pony.button'].props.radius,18);
 for(const palette of Object.values(catalog.schemes)){
  const roles=roleStyles(palette);assert.ok(contrast(palette.canvas,palette.text)>=4.5,palette.name);assert.ok(contrast(roles.button.bg_color,roles.button.text_color)>=4.5,palette.name+' button');assert.ok(contrast(roles.button_pressed.bg_color,roles.button_pressed.text_color)>=4.5,palette.name+' pressed');assert.ok(contrast(roles.indicator.line_color,palette.surface)>=3,palette.name+' graph line');
 }
});

test('a caller-defined scheme id and role geometry use the existing codec, without built-in branches',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'nacborui-custom-scheme-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'custom.json');
 const catalog=JSON.parse(await readFile(new URL('../examples/windows_player/registry-schemes.json',import.meta.url),'utf8'));
 const custom={format:catalog.format,default:'by_agent',schemes:{by_agent:{...catalog.schemes.classic,name:'Авторская',roleOverrides:{button:{radius:11,border_width:2}}}}};
 await writeFile(file,JSON.stringify(custom));const result=await compileSchemes(file),project=decodeProject(result.bytes);assert.equal(result.default,'by_agent');assert.equal(project.styles['by_agent.button'].props.radius,11);
 custom.schemes.by_agent.roleOverrides={missing:{radius:2}};await writeFile(file,JSON.stringify(custom));await assert.rejects(compileSchemes(file),/role override/);
 custom.schemes.by_agent.roleOverrides={button:{made_up_property:2}};await writeFile(file,JSON.stringify(custom));await assert.rejects(compileSchemes(file));
 custom.schemes.by_agent.roleOverrides={button:{radius:'invalid'}};await writeFile(file,JSON.stringify(custom));await assert.rejects(compileSchemes(file));
});
