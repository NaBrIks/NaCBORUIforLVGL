import {contract} from './contract.js';

export const integerRange=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
export function text(value,max,label='Text',empty=false){
 if(typeof value!=='string'||(!empty&&!value.length)||value.includes('\0')||new TextEncoder().encode(value).length>max)throw Error(label);
 return value;
}
export function object(value,keys,label='Object'){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null||Object.keys(value).some(key=>!keys.includes(key)))throw Error(label);
 return value;
}
export function numericLimits(type){return ['lv_opa_t','uint8_t'].includes(type)?[0,255]:type==='uint16_t'?[0,65535]:type==='uint32_t'?[0,4294967295]:[-2147483648,2147483647];}

// Each representation owns both directions. All callers use these adapters, including validation.
const adapters={
 color:{
  encode(value){if(typeof value==='string'&&/^#[\da-f]{6}$/i.test(value))return parseInt(value.slice(1),16);if(integerRange(value,0,0xffffff))return value;throw Error('RGB color');},
  decode(value){if(!integerRange(value,0,0xffffff))throw Error('RGB integer');return '#'+value.toString(16).padStart(6,'0');}
 },
 boolean:{encode(value){if(typeof value!=='boolean')throw Error('Boolean');return value;},decode(value){return this.encode(value);}},
 resource:{encode:value=>text(value,63,'Registered resource name'),decode(value){return this.encode(value);}},
 dimension:{
  encode(value){const {coordMax,coordSpec,pctMax}=contract.valueRules.dimension;if(value==='content')return coordMax|coordSpec;if(value&&typeof value==='object'){object(value,['pct'],'Dimension');if(!integerRange(value.pct,-pctMax,pctMax))throw Error('Integer percentage required');return coordSpec|(value.pct<0?(coordMax-1)/2-value.pct:value.pct);}if(!integerRange(value,-coordMax,coordMax))throw Error('Pixel dimension');return value;},
  decode(value){const {coordMax,coordSpec}=contract.valueRules.dimension;if(!integerRange(value,-coordMax,coordMax|coordSpec))throw Error('Dimension integer');if(value===(coordMax|coordSpec))return 'content';if(value>=coordSpec){const plain=value&coordMax;const pct=plain>(coordMax-1)/2?(coordMax-1)/2-plain:plain;const result={pct};this.encode(result);return result;}return value;}
 },
 tracks:{
  encode(value){if(typeof value==='string')return adapters.resource.encode(value);const {maxTracks,maxPixels,maxFraction,content,fractionBase}=contract.valueRules.grid;if(!Array.isArray(value)||!value.length||value.length>maxTracks)throw Error('Grid track count');return value.map(track=>{if(track==='content')return content;if(track&&typeof track==='object'){object(track,['fr'],'Grid FR');if(!integerRange(track.fr,1,maxFraction))throw Error('Grid fraction');return fractionBase+track.fr;}if(!integerRange(track,0,maxPixels))throw Error('Grid pixel range');return track;});},
  decode(value){if(typeof value==='string')return adapters.resource.decode(value);const {maxTracks,maxPixels,maxFraction,content,fractionBase}=contract.valueRules.grid;if(!Array.isArray(value)||!value.length||value.length>maxTracks)throw Error('Grid track count');return value.map(track=>{if(track===content)return 'content';if(integerRange(track,fractionBase+1,fractionBase+maxFraction))return {fr:track-fractionBase};if(!integerRange(track,0,maxPixels))throw Error('Grid pixel range');return track;});}
 }
};
function adapter(type,property){if(contract.valueRules.dimension.properties.includes(property))return adapters.dimension;if(contract.valueRules.grid.properties.includes(property))return adapters.tracks;return type==='lv_color_t'?adapters.color:type==='bool'?adapters.boolean:type.includes('*')?adapters.resource:null;}
function number(type,value,property){
 const rule=contract.valueRules.properties[property]??{},enumeration=rule.symbols??contract.enums[type],flags=contract.valueRules.flagTypes.includes(type);
 if(enumeration&&typeof value==='string'){const symbols=value.split('|').map(s=>s.trim());if(symbols.length>1&&!flags)throw Error('Not a bit mask: '+type);value=symbols.reduce((result,symbol)=>{if(!Object.hasOwn(enumeration,symbol))throw Error('Unknown enum '+symbol);return result|enumeration[symbol];},0);}
 const [min,max]=numericLimits(type);
 if(!integerRange(value,rule.min??min,rule.max??max))throw Error('Out of range: '+property);
 const values=rule.values??(contract.enums[type]?Object.values(contract.enums[type]):null);
 if(values?.length&&(flags?(value<0||(value&~values.reduce((a,b)=>a|b,0))!==0):!values.includes(value)))throw Error('Invalid enum value: '+property);
 return value;
}
export function encodeValue(type,value,property){const codec=adapter(type,property);return codec?codec.encode(value):number(type,value,property);}
export function decodeValue(type,value,property){const codec=adapter(type,property);if(codec)return codec.decode(value);if(typeof value!=='number')throw Error('Integer expected: '+property);return number(type,value,property);}
