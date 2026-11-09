// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile} from 'node:fs/promises';
export async function readUiReference({kind,topic='overview',language='en'}){
 const file=(kind==='screen'?'assistant-layout-reference':'assistant-styles-reference')+(language==='ru'?'.ru.md':'.md');
 const text=await readFile(new URL('../../examples/windows_player/'+file,import.meta.url),'utf8');
 const sections=[...text.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
 const topics=sections.map(m=>m[1]);if(topic==='index')return {kind,topics};
 const found=sections.find(m=>m[1]===topic);if(!found)return {error:'unknown_reference_topic',kind,topic,topics};
 return {kind,topic,markdown:found[0].trim()};
}
