import {readFile,writeFile} from 'node:fs/promises';
import {encodeScreen,offlineCapabilities} from '../packages/screen-codec/index.js';
const compiler=JSON.parse(await readFile(new URL('../examples/native_widget/meter.json',import.meta.url)));
const capabilities=offlineCapabilities();
capabilities.extensions=[{id:256,name:'example:meter',abi:'meter-1',contract:compiler}];
capabilities.availableWidgets.push(256);
const document={format:'lvgl-screen-draft-1',id:'extension',name:'Runtime extension',size:{width:800,height:480},root:{id:'root',type:'obj',children:[{id:'meter',type:'example:meter',props:{reading:[42,'kPa'],alarm:3,value:0}}]}};
await writeFile(new URL('../local/screen-fixtures/extension.cbor',import.meta.url),encodeScreen(document,'extension',capabilities));
await writeFile(new URL('../local/screen-fixtures/extension-contract.json',import.meta.url),JSON.stringify(compiler));
