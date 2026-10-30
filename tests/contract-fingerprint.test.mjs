// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {screenContractFingerprint} from '../tools/contract_fingerprint.mjs';

test('Screen v3 preserves its published fingerprint across LF and CRLF checkouts',async()=>{
  const raw=await readFile(new URL('../contracts/screen-api-v3.json',import.meta.url),'utf8');
  const lf=raw.replace(/\r\n/g,'\n');
  const published='88b890b59be1a2bc499022a2e23870779778bf58dff3430f0ef8f091ae9c557a';
  assert.equal(screenContractFingerprint(lf),published);
  assert.equal(screenContractFingerprint(lf.replace(/\n/g,'\r\n')),published);
  assert.notEqual(screenContractFingerprint(lf+' '),published);
});
