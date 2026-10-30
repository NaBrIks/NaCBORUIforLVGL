import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadProject} from '../windows_player/loader.mjs';
import {compileSchemes} from '../windows_player/schemes.mjs';
const packet=await loadProject(fileURLToPath(new URL('./demo.json',import.meta.url)));
const schemes=await compileSchemes();
const array=(name,bytes)=>`alignas(4) static const unsigned char ${name}[]={${[...bytes].join(',')}};\n`;
await writeFile(new URL('./main/project.generated.hpp',import.meta.url),'#pragma once\n'+array('project_bytes',packet.bytes)+array('scheme_bytes',schemes.bytes));
console.log(`LilyGO: ${packet.width}x${packet.height}, project ${packet.bytes.length} bytes, schemes ${schemes.bytes.length} bytes`);
