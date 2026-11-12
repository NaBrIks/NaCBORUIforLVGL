// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Validate maintained bilingual documentation. Never overwrite owner-authored text.
import {readFile} from 'node:fs/promises';
import {authoringCatalog,widgetEnumerations} from '../packages/document-io/ui-reference.js';
import {contract} from '../packages/style-codec/contract.js';
import {normalizeProperties} from '../packages/style-codec/index.js';
import {readUiReference} from './designer/prompts/ui-reference.mjs';
import {readAssistantGuide} from './designer/prompts/guide.mjs';
const catalog=authoringCatalog();
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const examples=markdown=>[...markdown.matchAll(/`(\{[^`\n]+\})`/g)].flatMap(m=>{try{return [JSON.parse(m[1])]}catch{return []}});
for(const language of ['ru','en']){
 const guide=readAssistantGuide({language});if(language==='en')assert(!/[А-Яа-яЁё]/.test(guide.instructions),'Translate remaining Russian system instructions');
 for(const kind of ['screen','style']){
  const index=await readUiReference({kind,topic:'index',language});
  for(const item of kind==='screen'?catalog.widgets:catalog.styles){
   const topic=item.type??item.name;assert(index.topics.includes(topic),'Missing documentation topic '+language+'/'+topic);
   const reference=await readUiReference({kind,topic,language});
   if(kind==='style'){
    assert(reference.markdown.includes(item.lvgl),'Missing method mapping '+item.lvgl);
    const example=examples(reference.markdown).find(v=>v.style&&Object.hasOwn(v.style,item.name));assert(example,'Missing JSON form '+item.name);normalizeProperties(example.style);
   }else for(const method of item.methods)assert(reference.markdown.includes('"'+method.name+'"'),'Missing component JSON method '+topic+'.'+method.name);
  }
  const enums=await readUiReference({kind,topic:'enumerations',language});
  const values=kind==='style'?{...contract.enums,layout:contract.valueRules.properties.layout.symbols}:widgetEnumerations;
  for(const enumeration of Object.values(values))for(const[name,value]of Object.entries(enumeration))assert(enums.markdown.includes('`'+JSON.stringify(name)+'` | `'+value+'`'),'Missing enum mapping '+name);
 }
 console.log('Validated '+language+' prompt and complete JSON method/enum references; '+Buffer.byteLength(guide.instructions)+' bytes');
}
const main=await readFile(new URL('../tools/designer/prompts/assistant-system-prompt.ru.md',import.meta.url),'utf8');const english=await readFile(new URL('../tools/designer/prompts/assistant-system-prompt.md',import.meta.url),'utf8');assert(main.match(/guide-version:([^ ]+)/)?.[1]===english.match(/guide-version:([^ ]+)/)?.[1],'Synchronize the prompt translations');
