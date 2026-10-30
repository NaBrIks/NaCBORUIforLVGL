// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile} from 'node:fs/promises';
import {contract} from '../packages/style-codec/contract.js';
import {screenContract} from '../packages/screen-codec/contract.js';
const catalog={format:'lvgl-cbor-capabilities-1',style:contract,screen:screenContract,roundtrip:'canonical-v1',styleScopes:['global-static','global-dynamic','screen','local'],screenRetention:['release','cache']};
const output='// Generated build catalog; live availability is added by capabilities.cpp.\nstatic constexpr const char capabilities_catalog[]=\n'+JSON.stringify(catalog).match(/[\s\S]{1,4000}/g).map(chunk=>'R"CAP('+chunk+')CAP"').join('\n')+';\n';
const path=new URL('../src/capabilities_catalog.inc',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==output)throw Error('Stale capabilities catalog');}
else await writeFile(path,output);
