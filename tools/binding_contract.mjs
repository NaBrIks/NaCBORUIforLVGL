// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),raw=await readFile(new URL('contracts/binding-api-v1.json',root),'utf8'),contract=JSON.parse(raw);
const sha256=createHash('sha256').update(raw).digest('hex');
const header=`#pragma once\n#include <cstddef>\nnamespace lvgl_cbor::binding_contract {\ninline constexpr unsigned version=${contract.version};\ninline constexpr const char *sha256="${sha256}";\n${Object.entries(contract.limits).map(([k,v])=>`inline constexpr size_t ${k}=${v};`).join('\n')}\nstruct Operator { const char *name; unsigned min_args, max_args; };\ninline constexpr Operator operators[]={${Object.entries(contract.operators).map(([k,v])=>`{"${k}",${v[0]},${v[1]}}`).join(',')}};\ninline constexpr const char *event_names[]={${contract.events.map(JSON.stringify).join(',')}};\n}\n`;
for(const [path,text] of [['include/lvgl_cbor/binding_contract.hpp',header],['packages/screen-codec/binding-contract.js','// Generated; do not edit.\nexport const bindingContract='+JSON.stringify({...contract,sha256})+';\n']]){
 const url=new URL(path,root);if(process.argv.includes('--check')){if(await readFile(url,'utf8')!==text)throw Error('Stale binding contract '+path);}else await writeFile(url,text);
}
