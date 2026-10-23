import {mkdir,writeFile} from 'node:fs/promises';
import {encodeScreen} from '../packages/screen-codec/index.js';
const document={format:'lvgl-screen-draft-1',id:'pc-bindings',name:'PC binding integration',size:{width:800,height:480},theme:'none',root:{id:'pc-root',type:'obj',children:[{id:'pc-text',type:'label',bindings:[{method:'text',value:{source:'name'}}]},{id:'pc-switch',type:'switch',bindings:[{scope:'common',method:'state',value:[{literal:4},{source:'enabled'}]}],events:[{event:'value_changed',write:{source:'enabled',path:[]},value:{event:'value'}}]}]}};
const root=new URL('../local/binding-fixtures/',import.meta.url);await mkdir(root,{recursive:true});await writeFile(new URL('pc-screen.cbor',root),encodeScreen(document,'pc-binding-test'));
