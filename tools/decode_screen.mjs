// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {decodeScreen} from '../packages/screen-codec/index.js';
const [argument,destination]=process.argv.slice(2);
if(!argument)throw Error('Usage: node tools/decode_screen.mjs input.cbor [output.json]');
const input=resolve(argument),output=resolve(destination??input.replace(/\.cbor$/i,'')+'.json');
if(input===output)throw Error('Output must differ from CBOR input');
await writeFile(output,JSON.stringify(decodeScreen(await readFile(input)),null,2)+'\n');
console.log(output);
