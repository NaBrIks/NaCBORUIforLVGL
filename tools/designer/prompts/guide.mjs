// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFileSync} from 'node:fs';
const content=text=>text.replace(/<!-- (?:guide-version|translation-source):[^>]+ -->\s*/g,'');
export function readAssistantGuide({language='en'}={}){
 if(!['en','ru'].includes(language))throw Error('Assistant guide language');
 const suffix=language==='ru'?'.ru.md':'.md';
 const text=readFileSync(new URL('./assistant-system-prompt'+suffix,import.meta.url),'utf8');
 const version=text.match(/<!-- guide-version:([\d.\-]+) -->/)?.[1];
 if(!version)throw Error('Assistant system prompt version');
 const references=['assistant-layout-reference','assistant-styles-reference'].map(stem=>({name:stem+suffix,text:content(readFileSync(new URL('./'+stem+suffix,import.meta.url),'utf8'))}));
 return {version,language,instructions:[content(text),...references.map(r=>r.text)].join('\n\n'),references:references.map(r=>({name:r.name,bytes:Buffer.byteLength(r.text)}))};
}
const guide=readAssistantGuide();
export const assistantGuideVersion=guide.version;
export const assistantInstructions=guide.instructions;
