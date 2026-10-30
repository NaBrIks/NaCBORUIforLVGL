// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {encodeScreen} from '../packages/screen-codec/index.js';
if(!process.argv[2])throw Error('Usage: node tools/encode_screen.mjs input.json [output.cbor]');
const input=resolve(process.argv[2]),output=resolve(process.argv[3]??input.replace(/\.json$/i,'')+'.cbor');
if(input===output)throw Error('Output must differ from authoring input');
const doc=JSON.parse(await readFile(input,'utf8')),bytes=encodeScreen(doc,'cli-'+Date.now().toString(36));
await writeFile(output,bytes);console.log(`${output}: ${bytes.length} bytes`);
