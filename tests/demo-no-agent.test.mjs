// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {encodeScreen} from '../packages/screen-codec/index.js';

test('graphics project is an independent MCP target without LLM fields or bindings',async()=>{
 const path='examples/windows_player/graphics-gallery.json';
 const text=await readFile(path,'utf8');
 assert.doesNotMatch(text,/assistant[._]|OpenRouter|OpenAI|API.key/i);
 const project=JSON.parse(text);
 assert.deepEqual(Object.keys(project.screens),['raster','vector','canvas','controller','settings','shell']);
 const settings=project.screens.settings;
 assert.ok(encodeScreen(settings,'no-agent').length>0);
 assert.ok(JSON.stringify(settings).includes('ui.select_scheme'));
 assert.ok(JSON.stringify(settings).includes('demo.running'));
});

test('player rejects obsolete key-store option before launching a process',()=>{
 const result=spawnSync(process.execPath,['examples/windows_player/run.mjs','--assistant-store','unused'],{encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Unknown option --assistant-store/);
});
