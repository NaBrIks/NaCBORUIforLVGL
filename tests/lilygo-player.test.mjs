// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadProject} from '../examples/windows_player/loader.mjs';
import {encodeProject,decodeProject} from '../packages/project-codec/index.js';
import {screenContract} from '../packages/screen-codec/index.js';

test('compact MCU project shares the PC JSON/CBOR loader and covers all standard types',async()=>{
  const url=new URL('../examples/lilygo_t_display_s3/demo.json',import.meta.url);
  const source=JSON.parse(await readFile(url,'utf8')),loaded=await loadProject(fileURLToPath(url));
  assert.deepEqual([loaded.entry,loaded.width,loaded.height],['shell',320,170]);
  assert.deepEqual(encodeProject(decodeProject(loaded.bytes)),loaded.bytes);
  const types=new Set();function visit(node){types.add(node.type);node.children.forEach(visit);}
  Object.values(source.screens).forEach(page=>visit(page.root));
  assert.deepEqual([...types].sort(),screenContract.widgets.filter(widget=>!widget.retired).map(widget=>widget.name).sort());
  const view=source.screens.shell.root.children.find(node=>node.id==='content');
  assert.deepEqual(view.view.pages.map(page=>page.screen),['home','controls','schemes']);
  assert.deepEqual([view.style.width,view.style.height],[320,124]);
});
