// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {decodeMethods} from '@lvgl-cbor/style-codec';
import {screenContract} from './contract.js';
export function validateLayout(node,parent,named){
 const resolve=n=>{const result={};const uses=(n.styles??[]).filter(use=>use.ref.startsWith('screen:')).map(use=>({selector:use.selector,methods:named.get(use.ref.slice(7))}));for(const rule of [...uses,{selector:0,methods:n.style??new Map()},...(n.rules??[])]){const props=decodeMethods(rule.methods);if(rule.selector&0xffff){if(['layout','grid_column_dsc_array','grid_row_dsc_array','grid_cell_column_pos','grid_cell_row_pos','grid_cell_column_span','grid_cell_row_span'].some(key=>Object.hasOwn(props,key)))throw Error('State-dependent grid layout not supported');}else if(!(rule.selector&0xff0000))Object.assign(result,props);}return result;};
 const style=resolve(node),layout=style.layout;
 if(layout===2&&!(node.styles??[]).some(use=>!use.ref.startsWith('screen:'))&&(!Array.isArray(style.grid_column_dsc_array)||!Array.isArray(style.grid_row_dsc_array)))throw Error('Grid requires own tracks');
 const ignored=(node.common.get(screenContract.common.methods.find(m=>m.alias==='add_flags').opcode)??0)&(screenContract.flags.IGNORE_LAYOUT|screenContract.flags.FLOATING);
 if(parent&&!ignored)for(const [axis,tracks] of [['column',parent.grid_column_dsc_array],['row',parent.grid_row_dsc_array]])if(Array.isArray(tracks)&&(style['grid_cell_'+axis+'_pos']??0)+(style['grid_cell_'+axis+'_span']??1)>tracks.length)throw Error('Grid cell out of bounds');
 for(const child of node.children)validateLayout(child,layout===2?style:null,named);
}
