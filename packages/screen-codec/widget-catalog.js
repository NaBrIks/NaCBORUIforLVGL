import {screenContract} from './contract.js';
import {validateParameterSchema} from './parameter-schema.js';
import {encodeWidgetMethod} from './widget-methods.js';
import {validateBindingCapabilities,validateDataSchema} from './binding-schema.js';
import {bindingContract} from './binding-contract.js';
// Extension metadata lives on the PC. Firmware dispatch never inspects it.
export function widgetCatalog(capabilities) {
  validateBindingCapabilities(capabilities);
  const widgets=[...screenContract.widgets],ids=new Set(widgets.map(w=>w.id)),names=new Set(widgets.map(w=>w.name));
  for(const entry of capabilities?.extensions??[]) {
    if(!Number.isInteger(entry.id)||entry.id<256||entry.id>65535||ids.has(entry.id)||
       typeof entry.name!=='string'||!entry.name.includes(':')||names.has(entry.name)||
       typeof entry.abi!=='string'||!entry.abi||entry.abi.length>63)throw Error('Invalid extension identity');
    const {methods}=entry.contract??{};
    if(!Array.isArray(methods))throw Error('Invalid extension contract');
    const codes=new Set(),aliases=new Set();
    for(const method of methods){
      if(!Number.isInteger(method.opcode)||method.opcode<256||method.opcode>65535||codes.has(method.opcode)||
         typeof method.alias!=='string'||aliases.has(method.alias)||!Array.isArray(method.parameters)||
         method.phase!==undefined&&!Number.isFinite(method.phase))throw Error('Invalid extension method');
      if(!method.alias||method.alias.length>63||['__proto__','constructor','prototype'].includes(method.alias)||!method.parameters.length||method.parameters.length>16)throw Error('Invalid extension method');
      method.parameters.forEach(s=>validateParameterSchema(s));
      codes.add(method.opcode);aliases.add(method.alias);
    }
    const {title,description,preview,defaults,events}=entry.contract;
    if(title!==undefined&&(typeof title!=='string'||title.length>128)||description!==undefined&&(typeof description!=='string'||description.length>512))throw Error('Invalid extension presentation');
    if(preview!==undefined&&(!Number.isInteger(preview.width)||preview.width<1||preview.width>8192||!Number.isInteger(preview.height)||preview.height<1||preview.height>8192))throw Error('Invalid extension dimensions');
    if(events!==undefined){if(!Array.isArray(events)||new Set(events.map(e=>e.name)).size!==events.length)throw Error('Invalid extension events');for(const event of events){if(!bindingContract.events.includes(event.name)||Object.keys(event).some(key=>!['name','value'].includes(key)))throw Error('Invalid extension event');if(event.value!==undefined)validateDataSchema(event.value);}}
    const family={id:entry.id,name:entry.name,abi:entry.abi,methods,title,description,preview,defaults,events};
    if(defaults!==undefined){if(!defaults||typeof defaults!=='object'||Array.isArray(defaults))throw Error('Invalid extension defaults');for(const [alias,value] of Object.entries(defaults))encodeWidgetMethod(family,alias,value);}
    ids.add(entry.id);names.add(entry.name);widgets.push(family);
  }
  return widgets;
}
export function orderWidgetMethods(methods,family) {
  const phase=new Map(family.methods.map(m=>[m.opcode,m.phase??1]));
  return new Map([...methods].sort(([a],[b])=>phase.get(a)-phase.get(b)||a-b));
}
