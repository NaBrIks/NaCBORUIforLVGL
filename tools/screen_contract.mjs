// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {screenContractFingerprint} from './contract_fingerprint.mjs';
import {assertScreenAbiCompatible} from './screen-abi.mjs';
import {generateWidgetDispatch} from './widget_dispatch_generator.mjs';
const check=process.argv.includes('--check');
if(check&&process.argv.some(arg=>['--init','--update'].includes(arg)))throw Error('--check cannot mutate a contract');
async function writeGenerated(path,source){if(check){if(await readFile(path,'utf8')!==source)throw Error('Stale generated file: '+path);}else await writeFile(path,source);}
const root=new URL('../',import.meta.url),path=new URL('contracts/screen-api-v3.json',root);
const raw=await readFile(path,'utf8'),contract=JSON.parse(raw),lock=JSON.parse(await readFile(new URL('contracts/screen-abi-v3.lock.json',root),'utf8'));
assertScreenAbiCompatible(lock,contract);
const hash=screenContractFingerprint(raw);
if(!process.argv.includes('--check'))await mkdir(new URL('packages/screen-codec/',root),{recursive:true});
await writeGenerated(new URL('packages/screen-codec/contract.js',root),'// Generated; do not edit.\nexport const screenContract='+JSON.stringify({...contract,sha256:hash})+';\n');
await writeGenerated(new URL('include/lvgl_cbor/screen_contract.hpp',root),`#pragma once\n#include <cstddef>\nnamespace lvgl_cbor {inline constexpr const char *screen_contract_sha256="${hash}";inline constexpr unsigned screen_contract_version=${contract.version};\n${Object.entries(contract.commands).map(([name,code])=>`inline constexpr unsigned screen_command_${name}=${code};`).join('\n')}\ninline constexpr size_t screen_widget_count=${contract.widgets.length};\ninline constexpr size_t screen_packet_bytes=${contract.limits.packetBytes}, screen_max_nodes=${contract.limits.nodes}, screen_max_depth=${contract.limits.depth}, screen_max_styles=${contract.limits.styles}, screen_text_bytes=${contract.limits.textBytes};\ninline constexpr size_t widget_text_bytes=${contract.valueRules.textBytesPerValue}, line_min_points=${contract.valueRules.points.minItems}, line_max_points=${contract.valueRules.points.maxItems}, screen_style_uses=${contract.valueRules.maxStyleUses};\ninline constexpr int line_point_min=${contract.valueRules.points.min}, line_point_max=${contract.valueRules.points.max};\n}\n`);
await writeGenerated(new URL('src/widget_methods.inc',root),generateWidgetDispatch(contract));
console.log('Screen ABI v3:',contract.widgets.length,'component handlers');
