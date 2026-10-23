import {bindingContract,dataDescriptor,dataSchemaAtPath,defaultDataValue,methodDataSchema} from '@lvgl-cbor/screen-codec';

export const expressionMode=value=>Array.isArray(value)?'array':value&&Object.hasOwn(value,'object')?'object':value&&Object.hasOwn(value,'op')?'op':value&&Object.hasOwn(value,'event')?'event':value&&Object.hasOwn(value,'source')?'source':'literal';
export const hasObjectField=(value,key)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,key);
export function initialDataValue(schema){const s=dataDescriptor(schema);return s?.type==='object'?{}:s?.type==='tuple'?s.items.map(initialDataValue):s?.type==='array'?Array.from({length:s.minItems??0},()=>initialDataValue(s.items)):defaultDataValue(schema);}
export function toggleObjectField(value,key,enabled,create){const next={...value};if(!enabled)delete next[key];else if(!hasObjectField(value,key))Object.defineProperty(next,key,{value:create(),enumerable:true,writable:true,configurable:true});return next;}
export function createExpression(mode,schema,{sources=[],eventSchema}={}){
 const s=dataDescriptor(schema);
 if(mode==='source')return {source:sources[0]?.name??'',path:[]};
 if(mode==='event')return {event:'value'};
 if(mode==='array')return s?.type==='tuple'?s.items.map(item=>createExpression('literal',item)):Array.from({length:s?.minItems??0},()=>createExpression('literal',s?.items));
 if(mode==='object')return {object:{}};
 if(mode==='op')return {op:'select',args:[{literal:false},createExpression('literal',schema),createExpression('literal',schema)]};
 return {literal:initialDataValue(schema??eventSchema??'text')};
}
export function operatorArgumentSchema(op,index,expected){
 if(op==='select')return index===0?{type:'bool'}:expected;
 if(['and','or','not'].includes(op))return {type:'bool'};
 if(['eq','ne'].includes(op))return undefined;
 return {type:'number'};
}
export function changeOperator(op,previous,expected){
 const [minimum,maximum]=bindingContract.operators[op],old=previous?.args??[];
 return {op,args:Array.from({length:Math.max(minimum,Math.min(old.length,maximum))},(_,i)=>old[i]??createExpression('literal',operatorArgumentSchema(op,i,expected)))};
}
export function bindingTargetSchema(entry){return entry?methodDataSchema(entry.schema):undefined;}
export function replaceSourcePathSegment(reference,index,value,schema){
 const previous=reference.path??[],path=[...previous.slice(0,index),value];
 try{
  const parent=dataDescriptor(dataSchemaAtPath(schema,previous.slice(0,index))),candidate=[...path,...previous.slice(index+1)];
  if(parent?.type==='array'&&typeof value==='number'){dataSchemaAtPath(schema,candidate);return {...reference,path:candidate};}
 }catch{/* A changed field/index cannot retain a suffix that its catalog does not describe. */}
 return {...reference,path};
}
