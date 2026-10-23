import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),raw=await readFile(new URL('contracts/composition-api-v1.json',root),'utf8'),contract=JSON.parse(raw);
const sha256=createHash('sha256').update(raw).digest('hex');
const header=`#pragma once\n#include <cstddef>\nnamespace lvgl_cbor::composition_contract {\ninline constexpr unsigned version=${contract.version};\ninline constexpr const char *sha256="${sha256}";\n${Object.entries(contract.limits).map(([key,value])=>`inline constexpr size_t ${key}=${value};`).join('\n')}\n}\n`;
for(const [path,text] of [['include/lvgl_cbor/composition_contract.hpp',header],['packages/screen-codec/composition-contract.js','// Generated; do not edit.\nexport const compositionContract='+JSON.stringify({...contract,sha256})+';\n']]){
 const url=new URL(path,root);if(process.argv.includes('--check')){if(await readFile(url,'utf8')!==text)throw Error('Stale composition contract '+path);}else await writeFile(url,text);
}
