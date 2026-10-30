// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {assertAbiCompatible} from '../tools/style-abi.mjs';
const lock=JSON.parse(await readFile(new URL('../contracts/style-abi-v2.lock.json',import.meta.url)));
test('ABI lock preserves every assigned opcode and signature',async()=>{assertAbiCompatible(lock,JSON.parse(await readFile(new URL('../contracts/style-api-v2.json',import.meta.url))));});
test('ABI rejects removed, renamed and retyped entries',()=>{
 for(const mutate of [c=>c.methods.pop(),c=>c.methods[0].name='other',c=>c.methods[0].parameters=['bool'],c=>c.signatures[0].parameters=['bool']]){const c=structuredClone(lock);mutate(c);assert.throws(()=>assertAbiCompatible(lock,c));}
});
test('retirement leaves a permanent slot and cannot be reversed',()=>{const retired=structuredClone(lock);retired.methods[0].retired=true;assertAbiCompatible(lock,retired);assert.throws(()=>assertAbiCompatible(retired,lock));});
