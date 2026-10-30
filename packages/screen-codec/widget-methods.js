// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {screenContract} from './contract.js';
import {convertParameter} from './parameter-schema.js';
export function encodeWidgetMethod(family,name,value){const m=family.methods.find(m=>!m.retired&&m.alias===name);if(!m)throw Error('Unsupported widget property '+name);const values=m.parameters.length===1?[value]:value;if(!Array.isArray(values)||values.length!==m.parameters.length)throw Error('Widget argument count');
 const converted=values.map((v,i)=>convertParameter(v,m.parameters[i],m,name));
 if(m.constraint==='ascending'&&converted[0]>converted[1])throw Error('min > max');return [m.opcode,m.parameters.length===1?converted[0]:converted];
}
export const decodeWidgetMethods=(map,family)=>{if(!(map instanceof Map))throw Error('Widget methods');const props={};for(const [opcode,value] of map){const m=family.methods.find(m=>!m.retired&&m.opcode===opcode);if(!m)throw Error('Widget opcode');const converted=encodeWidgetMethod(family,m.alias,value)[1];if(!family.abi&&m.alias==='range'){props.min=converted[0];props.max=converted[1];}else props[m.alias]=!family.abi&&m.alias==='options'?converted.split('\n'):converted;}return props;};
