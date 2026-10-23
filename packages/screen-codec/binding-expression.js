import {object as only,text,integerRange} from '@lvgl-cbor/style-codec/values';
import {bindingContract} from './binding-contract.js';
import {dataDescriptor,dataSchemaAtPath,validateDataValue,validateDataPath,bindingCatalogIsAuthoritative,bindingText,bindingLimits} from './binding-schema.js';

const L=bindingContract.limits,numeric=s=>['integer','number'].includes(dataDescriptor(s)?.type);
export const UNKNOWN=Symbol('unknown binding value');
export function literalSchema(value){
 if(value===null)return {type:'null'};if(Array.isArray(value))return {type:'tuple',items:value.map(literalSchema)};
 if(typeof value==='object')return {type:'object',fields:Object.fromEntries(Object.entries(value).map(([key,v])=>[key,literalSchema(v)]))};
 return {type:typeof value==='number'?(Number.isSafeInteger(value)?'integer':'number'):typeof value==='boolean'?'bool':'text'};
}
export function schemasCompatible(actual,expected){
 if(actual===undefined||expected===undefined)return true;
 const a=dataDescriptor(actual),e=dataDescriptor(expected);
 if(numeric(a)&&numeric(e))return e.type==='number'||a.type==='integer';
 if(a.type==='tuple'){
  if(e.type==='tuple')return a.items.length===e.items.length&&a.items.every((s,i)=>schemasCompatible(s,e.items[i]));
  return e.type==='array'&&a.items.length>=(e.minItems??0)&&a.items.length<=e.maxItems&&a.items.every(s=>schemasCompatible(s,e.items));
 }
 if(a.type!==e.type)return false;
 if(a.type==='object')return Object.entries(a.fields).every(([key,s])=>Object.hasOwn(e.fields,key)&&schemasCompatible(s,e.fields[key]));
 if(a.type==='array')return schemasCompatible(a.items,e.items);
 return true;
}
function mergeSchema(a,b){
 if(a===undefined||b===undefined)return undefined;
 if(numeric(a)&&numeric(b))return {type:dataDescriptor(a).type==='integer'&&dataDescriptor(b).type==='integer'?'integer':'number'};
 if(schemasCompatible(a,b)&&schemasCompatible(b,a))return a;
 throw Error('Select branches have incompatible types');
}
export function inspectExpression(expression,{capabilities,eventSchema,eventContext=false}={}){
 const authoritative=bindingCatalogIsAuthoritative(capabilities),sources=capabilities?.binding?.sources??[],dependencies=new Set(),limits=bindingLimits(capabilities);let count=0;
 function check(e,depth){
  if(depth>limits.expressionDepth||++count>limits.expressionNodes)throw Error('Binding expression limit');
  if(Array.isArray(e)){if(e.length>limits.arrayItems)throw Error('Binding expression array limit');return {type:'tuple',items:e.map(child=>check(child,depth+1))};}
  only(e,['source','path','literal','op','args','event','object'],'Binding expression');
  const kinds=['source','literal','op','event','object'].filter(key=>Object.hasOwn(e,key));if(kinds.length!==1)throw Error('Binding expression kind');
  const kind=kinds[0];only(e,kind==='source'?['source','path']:kind==='op'?['op','args']:[kind],'Binding expression fields');
  if(kind==='literal'){validateDataValue(e.literal,undefined,{limits});return literalSchema(e.literal);}
  if(kind==='source'){
   bindingText(e.source,63,'Binding source');validateDataPath(e.path??[]);if((e.path?.length??0)>limits.pathDepth)throw Error('Data path device limit');dependencies.add(e.source);
   const source=sources.find(s=>s.name===e.source);if(!source&&authoritative)throw Error('Unknown binding source '+e.source);
   return dataSchemaAtPath(source?.schema,e.path??[]);
  }
  if(kind==='event'){
   if(!eventContext||e.event!=='value')throw Error('Event value outside a UI event');
   if(eventSchema===null)throw Error('This component event has no value');return eventSchema;
  }
  if(kind==='object'){
   only(e.object,Object.keys(e.object??{}),'Object expression');if(Object.keys(e.object).length>limits.objectFields)throw Error('Object expression field limit');
   const fields={};for(const [key,value] of Object.entries(e.object)){validateDataPath([key]);Object.defineProperty(fields,key,{value:check(value,depth+1),enumerable:true});}return {type:'object',fields};
  }
  const arity=Object.hasOwn(bindingContract.operators,e.op)?bindingContract.operators[e.op]:null;if(!arity||!Array.isArray(e.args)||!integerRange(e.args.length,...arity))throw Error('Binding operator/arity');
  const args=e.args.map(arg=>check(arg,depth+1)),known=args.filter(s=>s!==undefined).map(dataDescriptor);
  if(['and','or','not'].includes(e.op)){if(known.some(s=>s.type!=='bool'))throw Error('Boolean operator arguments');return {type:'bool'};}
  if(e.op==='select'){
   if(args[0]&&dataDescriptor(args[0]).type!=='bool')throw Error('Select condition must be bool');return mergeSchema(args[1],args[2]);
  }
  if(['eq','ne','lt','le','gt','ge'].includes(e.op)){
   if(known.some(s=>!['null','bool','integer','number','text'].includes(s.type)))throw Error('Comparison requires scalar values');
   if(!['eq','ne'].includes(e.op)&&args.every(s=>s!==undefined)&&!schemasCompatible(args[0],args[1])&&!schemasCompatible(args[1],args[0]))throw Error('Comparison argument types');
   if(!['eq','ne'].includes(e.op)&&known.some(s=>!numeric(s)&&s.type!=='text'))throw Error('Ordered comparison arguments');return {type:'bool'};
  }
  if(known.some(s=>!numeric(s)))throw Error('Arithmetic requires numbers');
  return {type:e.op==='round'?'integer':e.op==='div'||known.some(s=>s.type==='number')?'number':'integer'};
 }
 const schema=check(expression,1);return {schema,dependencies:[...dependencies],nodes:count};
}
export const validateExpression=(expression,options)=>{inspectExpression(expression,options);return expression;};
export const expressionDependencies=expression=>inspectExpression(expression).dependencies;
export const inferExpressionSchema=(expression,options)=>inspectExpression(expression,options).schema;
const cleanNumber=n=>Object.is(n,-0)?0:n;
const numericValue=value=>typeof value==='number'&&Number.isFinite(value);
const scalarValue=value=>value===null||['string','boolean'].includes(typeof value)||numericValue(value);
function utf8Compare(a,b){const left=new TextEncoder().encode(a),right=new TextEncoder().encode(b);for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]<right[i]?-1:1;return left.length<right.length?-1:left.length>right.length?1:0;}
export function evaluateExpression(expression,{sources={},event=UNKNOWN}={}){
 function run(e){
  if(Array.isArray(e)){const values=e.map(run);return values.includes(UNKNOWN)?UNKNOWN:values;}
  if(Object.hasOwn(e,'literal'))return e.literal;
  if(Object.hasOwn(e,'source')){
   let value;if(Array.isArray(sources)){const source=sources.find(s=>s.name===e.source);value=source&&source.state==='known'&&Object.hasOwn(source,'value')?source.value:UNKNOWN;}
   else value=Object.hasOwn(sources,e.source)?sources[e.source]:UNKNOWN;
   for(const part of e.path??[]){if(value===UNKNOWN||value===null||typeof value!=='object'||!Object.hasOwn(value,part))return UNKNOWN;value=value[part];}return value===undefined?UNKNOWN:value;
  }
  if(e.event)return event;
  if(e.object){const out={};for(const [key,child] of Object.entries(e.object)){const value=run(child);if(value===UNKNOWN)return UNKNOWN;Object.defineProperty(out,key,{value,enumerable:true,writable:true,configurable:true});}return out;}
  if(e.op==='select'){const condition=run(e.args[0]);return typeof condition==='boolean'?run(e.args[condition?1:2]):UNKNOWN;}
  if(e.op==='and'||e.op==='or'){let unknown=false;for(const arg of e.args){const value=run(arg);if(value===UNKNOWN){unknown=true;continue;}if(typeof value!=='boolean')return UNKNOWN;if(e.op==='and'&&!value)return false;if(e.op==='or'&&value)return true;}return unknown?UNKNOWN:e.op==='and';}
  const values=e.args.map(run);if(values.includes(UNKNOWN))return UNKNOWN;
  const [a,b]=values;let result;
  switch(e.op){
   case 'eq':return scalarValue(a)&&scalarValue(b)?a===b:UNKNOWN;case 'ne':return scalarValue(a)&&scalarValue(b)?a!==b:UNKNOWN;
   case 'lt':case 'le':case 'gt':case 'ge':{const order=numericValue(a)&&numericValue(b)?a<b?-1:a>b?1:0:typeof a==='string'&&typeof b==='string'?utf8Compare(a,b):undefined;if(order===undefined)return UNKNOWN;return e.op==='lt'?order<0:e.op==='le'?order<=0:e.op==='gt'?order>0:order>=0;}
   case 'not':return typeof a==='boolean'?!a:UNKNOWN;
   case 'add':result=a+b;break;case 'sub':result=a-b;break;case 'mul':result=a*b;break;case 'div':if(b===0)return UNKNOWN;result=a/b;break;
   case 'round':result=Math.sign(a)*Math.floor(Math.abs(a)+.5);break;default:return UNKNOWN;
  }
  if(!numericValue(a)||values.length>1&&!numericValue(b))return UNKNOWN;
  return typeof result==='number'&&Number.isFinite(result)?cleanNumber(result):UNKNOWN;
 }
 return run(expression);
}
