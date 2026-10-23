import {contract,normalizeProperties} from '@lvgl-cbor/style-codec';
const dimensions={'width':'width','height':'height','min-width':'min_width','min-height':'min_height','max-width':'max_width','max-height':'max_height','left':'x','top':'y'};
const lengths={'border-width':'border_width','border-radius':'radius','outline-width':'outline_width','outline-offset':'outline_pad','letter-spacing':'text_letter_space','row-gap':'pad_row','column-gap':'pad_column'};
for(const side of ['top','right','bottom','left']){lengths['padding-'+side]='pad_'+side;lengths['margin-'+side]='margin_'+side;}
const colors={'color':['text_color','text_opa'],'background-color':['bg_color','bg_opa'],'border-color':['border_color','border_opa'],'outline-color':['outline_color','outline_opa']};
const enums={
 'display':['layout',{block:'LV_LAYOUT_NONE',flex:'LV_LAYOUT_FLEX',grid:'LV_LAYOUT_GRID'}],
 'flex-direction':['flex_flow',{row:'LV_FLEX_FLOW_ROW',column:'LV_FLEX_FLOW_COLUMN','row-reverse':'LV_FLEX_FLOW_ROW_REVERSE','column-reverse':'LV_FLEX_FLOW_COLUMN_REVERSE'}],
 'justify-content':['flex_main_place',{'flex-start':'LV_FLEX_ALIGN_START','flex-end':'LV_FLEX_ALIGN_END',center:'LV_FLEX_ALIGN_CENTER','space-between':'LV_FLEX_ALIGN_SPACE_BETWEEN','space-around':'LV_FLEX_ALIGN_SPACE_AROUND','space-evenly':'LV_FLEX_ALIGN_SPACE_EVENLY'}],
 'align-items':['flex_cross_place',{'flex-start':'LV_FLEX_ALIGN_START','flex-end':'LV_FLEX_ALIGN_END',center:'LV_FLEX_ALIGN_CENTER'}],
 'align-content':['flex_track_place',{'flex-start':'LV_FLEX_ALIGN_START','flex-end':'LV_FLEX_ALIGN_END',center:'LV_FLEX_ALIGN_CENTER','space-between':'LV_FLEX_ALIGN_SPACE_BETWEEN','space-around':'LV_FLEX_ALIGN_SPACE_AROUND','space-evenly':'LV_FLEX_ALIGN_SPACE_EVENLY'}],
 'text-align':['text_align',{left:'LV_TEXT_ALIGN_LEFT',right:'LV_TEXT_ALIGN_RIGHT',center:'LV_TEXT_ALIGN_CENTER',auto:'LV_TEXT_ALIGN_AUTO'}],
 'direction':['base_dir',{ltr:'LV_BASE_DIR_LTR',rtl:'LV_BASE_DIR_RTL',auto:'LV_BASE_DIR_AUTO'}]
};
export function expandProperties(props){
 const result={};for(const [name,value] of Object.entries(props)){const method=contract.methods.find(m=>!m.retired&&(m.alias===name||m.name===name));if(!method)throw Error('Unknown property '+name);method.properties.forEach((p,i)=>result[p]=method.parameters.length>1?value[i]:value);}
 return result;
}
function length(value,percentage=false){
 if(percentage&&value==='fit-content')return 'content';
 const m=/^(-?\d+)(px|%)?$/.exec(value);if(!m||!Number.isSafeInteger(Number(m[1])))throw Error('Expected integer px'+(percentage?', % or fit-content':''));
 if(m[2]==='%'){if(!percentage)throw Error('Percentage unsupported here');return {pct:Number(m[1])};}
 if(!m[2]&&Number(m[1])!==0)throw Error('Nonzero length requires px');return Number(m[1]);
}
function alpha(value){const n=Number(value);if(!value.trim()||!Number.isFinite(n)||n<0||n>1)throw Error('Opacity must be 0..1');return Math.round(n*255);}
function color(value){
 const names={black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',blue:'#0000ff',yellow:'#ffff00',gray:'#808080',grey:'#808080',transparent:'#00000000'};
 value=names[value.toLowerCase()]??value;
 if(/^#[\da-f]{3,4}$/i.test(value))value='#'+[...value.slice(1)].map(c=>c+c).join('');
 if(/^#[\da-f]{6}([\da-f]{2})?$/i.test(value))return [value.slice(0,7).toLowerCase(),value.length===9?parseInt(value.slice(7),16):undefined];
 const rgb=/^rgba?\(([^)]+)\)$/i.exec(value);if(rgb){const values=rgb[1].split(',').map(x=>x.trim());if(![3,4].includes(values.length)||values.slice(0,3).some(x=>!/^\d+$/.test(x)||Number(x)>255))throw Error('RGB channels 0..255');return ['#'+values.slice(0,3).map(x=>Number(x).toString(16).padStart(2,'0')).join(''),values.length===4?alpha(values[3]):undefined];}
 throw Error('Expected hex, rgb(), rgba() or a supported color name');
}
export function declaration(property,value){
 if(Object.hasOwn(dimensions,property)){const v=length(value,true),position=['left','top'].includes(property);if(position&&v==='content'||!position&&(typeof v==='object'?v.pct<0:typeof v==='number'&&v<0))throw Error('Invalid CSS dimension');return {[dimensions[property]]:v};}
 if(Object.hasOwn(lengths,property)){const v=length(value);if(v<0&&!property.startsWith('margin-')&&!['outline-offset','letter-spacing'].includes(property))throw Error('Negative CSS length unsupported here');return {[lengths[property]]:v};}
 if(Object.hasOwn(colors,property)){const [c,a]=color(value),[cp,ap]=colors[property];return {[cp]:c,...(a===undefined?{}:{[ap]:a})};}
 if(property==='padding'||property==='margin'){
  const v=value.split(/\s+/).map(x=>length(x));if(v.length<1||v.length>4)throw Error('Expected 1..4 lengths');if(property==='padding'&&v.some(n=>n<0))throw Error('Negative padding');
  const [top,right=top,bottom=top,left=right]=v;return Object.fromEntries(['top','right','bottom','left'].map((s,i)=>[(property==='padding'?'pad_':'margin_')+s,[top,right,bottom,left][i]]));
 }
 if(property==='gap'){const v=value.split(/\s+/).map(x=>length(x));if(v.length>2||v.some(n=>n<0))throw Error('Expected one or two nonnegative lengths');return {pad_row:v[0],pad_column:v[1]??v[0]};}
 if(property==='opacity')return {opa:alpha(value)};
 if(property==='flex-grow'){if(!/^\d+$/.test(value))throw Error('Expected nonnegative integer');return {flex_grow:Number(value)};}
 if(property==='font-family')return {text_font:value.replace(/^(['"])(.*)\1$/,'$2')};
 if(property==='font-size'){const n=length(value);if(![14,20,28].includes(n))throw Error('font-size: use 14px, 20px, 28px or a registered font-family');return {text_font:n===14?'default':'montserrat_'+n};}
 if(property==='border'){
  const m=/^(\S+)\s+solid\s+(.+)$/.exec(value);if(!m)throw Error('Only <px> solid <color>');return {border_width:length(m[1]),...declaration('border-color',m[2])};
 }
 if(property==='flex-flow'){
  const m=/^(row|column|row-reverse|column-reverse)(?:\s+(nowrap|wrap|wrap-reverse))?$/.exec(value);if(!m)throw Error('Unsupported flex-flow');
  const direction=m[1].replace('-reverse','').toUpperCase(),wrap=m[2]??'nowrap';if(m[1].endsWith('-reverse')&&wrap!=='nowrap')throw Error('Combined direction/wrap reversal is unsupported');
  return {flex_flow:'LV_FLEX_FLOW_'+direction+(wrap==='nowrap'?(m[1].endsWith('-reverse')?'_REVERSE':''):wrap==='wrap'?'_WRAP':'_WRAP_REVERSE')};
 }
 if(Object.hasOwn(enums,property)){const [key,values]=enums[property];if(!Object.hasOwn(values,value))throw Error('Unsupported '+property+' value');return {[key]:values[value]};}
 throw Error('Unsupported CSS property '+property);
}
export function validateProperties(props){return normalizeProperties(props);}
const len=value=>typeof value==='object'?value.pct+'%':value==='content'?'fit-content':value===0?'0':value+'px';
export function exportDeclarations(props){
 const p=normalizeProperties(expandProperties(props)),out=[],used=new Set();
 const add=(css,key,convert=v=>v)=>{if(Object.hasOwn(p,key)){out.push([css,convert(p[key])]);used.add(key);}};
 for(const [css,key] of Object.entries(dimensions))add(css,key,len);
 for(const [css,key] of Object.entries(lengths))add(css,key,len);
 for(const [css,[key,opacity]] of Object.entries(colors)){
  if(Object.hasOwn(p,opacity)&&!Object.hasOwn(p,key))throw Error('CSS export requires '+key+' with '+opacity);
  add(css,key,v=>v+(Object.hasOwn(p,opacity)?p[opacity].toString(16).padStart(2,'0'):''));if(Object.hasOwn(p,key))used.add(opacity);
 }
 add('opacity','opa',v=>String(v/255));add('flex-grow','flex_grow');add('font-family','text_font',v=>JSON.stringify(v));
 for(const [css,[key,values]] of Object.entries(enums)){
  if(!Object.hasOwn(p,key)||used.has(key))continue;
  const method=contract.methods.find(m=>m.alias===key),mapping=contract.valueRules.properties[key]?.symbols??contract.enums[method.parameters[0]];
  const entry=Object.entries(values).find(([,symbol])=>mapping[symbol]===p[key]);
  if(entry)add(css,key,()=>entry[0]);
 }
 if(Object.hasOwn(p,'flex_flow')&&!used.has('flex_flow')){
  const value=Object.entries(contract.enums.lv_flex_flow_t).find(([key,v])=>key.startsWith('LV_FLEX_FLOW_')&&v===p.flex_flow)?.[0];
  if(value){const raw=value.replace('LV_FLEX_FLOW_','').toLowerCase();if(raw.includes('_wrap'))add('flex-flow','flex_flow',()=>raw.replace('_wrap_reverse',' wrap-reverse').replace('_wrap',' wrap'));}
 }
 const unsupported=Object.keys(p).filter(key=>!used.has(key));if(unsupported.length)throw Error('Outside CSS subset: '+unsupported.join(', '));
 for(const [property,value] of out){if(String(value).includes('\\'))throw Error('CSS escapes are outside the supported subset');validateProperties(declaration(property,String(value)));}
 return out.map(([key,value])=>'  '+key+': '+value+';').join('\n');
}
