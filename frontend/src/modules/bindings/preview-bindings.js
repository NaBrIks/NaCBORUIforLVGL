import {evaluateExpression,formatBindingValue,UNKNOWN} from '@lvgl-cbor/screen-codec';
import {effectiveProps} from '../../screen-model.js';

// A read-only approximation of widget content. The MCU remains the LVGL executor;
// no runtime value is written into the project, persistence or auto-preview inputs.
export function previewBindings(node,sources=[],family){
 const content=effectiveProps(node),bindings=[];
 for(const rule of node.bindings??[]){
  if(rule.scope==='common'||!family?.methods?.some(method=>method.alias===rule.method&&!method.retired))continue;
  try{
   let value=evaluateExpression(rule.value,{sources});
   if(rule.format||family.methods.find(method=>method.alias===rule.method)?.parameters?.[0]==='text'&&!Array.isArray(value))value=formatBindingValue(value,rule.format);
   if(value!==UNKNOWN)content[rule.method]=value;
   const text=value===UNKNOWN?'--':typeof value==='string'?value:JSON.stringify(value);
   bindings.push({method:rule.method,text:text.length>160?text.slice(0,157)+'…':text});
  }catch{/* An unfinished authoring expression must not break the editor. */}
 }
 return {content,bindings};
}
