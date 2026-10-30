// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Authoring format. This draft is deliberately separate from style ABI v1.
import {contract} from '@lvgl-cbor/style-codec';
export const SCREEN_FORMAT='lvgl-screen-draft-1';
import {screenContract,widgetCatalog} from '@lvgl-cbor/screen-codec';
export const widgetTypes=screenContract.widgets.filter(w=>!w.retired).map(w=>w.name);
export const clone=value=>JSON.parse(JSON.stringify(value));
export function createNode(type='obj',id=type,capabilities){
 const family=widgetCatalog(capabilities).find(w=>w.name===type);
 if(!family)throw Error('Неизвестный тип '+type);
 const node={id,type,props:{},style:{},children:[]};
 if(family.abi){node.props=clone(family.defaults??{});if(family.preview)Object.assign(node.style,family.preview);return node;}
 if(['label','button','checkbox','textarea'].includes(type))node.props.text=type==='label'?'Label':type==='button'?'Button':type==='checkbox'?'Checkbox':'';
 if(['bar','slider','arc'].includes(type))Object.assign(node.props,{min:0,max:100,value:65});
 if(type==='line')node.props.points=[[0,50],[70,0],[140,40]];
 if(type==='dropdown')Object.assign(node.props,{options:['One','Two','Three'],selected:0});
 if(type==='image')node.props.src='';
 if(type==='switch')node.props.checked=true;
 if(type==='obj')Object.assign(node.style,{width:240,height:140,bg_color:'#eeeeee',bg_opa:255});
 return node;
}
export function createScreen(id='screen_1',name='Экран 1'){
 return {format:SCREEN_FORMAT,id,name,size:{width:800,height:480},styles:{},root:{id:'root',type:'obj',props:{},style:{bg_color:'#17252d',bg_opa:255,pad_all:24,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_row:16},children:[
  {id:'title',type:'label',props:{text:'New screen'},style:{text_color:'#ffffff',text_font:'montserrat_28'},children:[]},
  {id:'content',type:'obj',props:{},style:{width:{pct:100},height:260,bg_color:'#253b47',bg_opa:255,radius:8,pad_all:16,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_ROW',pad_column:16},children:[
   {id:'value',type:'label',props:{text:'65 %'},style:{text_color:'#80dfb0',text_font:'montserrat_28'},children:[]},
   {id:'level',type:'bar',props:{min:0,max:100,value:65},style:{width:280,height:24,bg_color:'#10212c',bg_opa:255},children:[]}
  ]}
 ]}};
}
export function flattenNodes(node,depth=0,parent=null){return [{node,depth,parent},...(node.children??[]).flatMap(child=>flattenNodes(child,depth+1,node))];}
export function createBlankScreen(id='screen_1',name='Экран 1'){
 const doc=createScreen(id,name);doc.root.children=[];
 doc.root.flags={SCROLLABLE:false};doc.root.style={bg_color:'#17252d',bg_opa:255,pad_all:0};
 return doc;
}
export function findNode(screen,id){return flattenNodes(screen.root).find(row=>row.node.id===id)?.node;}
export function nextId(screen,type){const ids=new Set(flattenNodes(screen.root).map(row=>row.node.id));let n=1;while(ids.has(type+'_'+n))n++;return type+'_'+n;}
export function removeNode(root,id){for(const node of flattenNodes(root)){const index=node.node.children?.findIndex(child=>child.id===id);if(index>=0){node.node.children.splice(index,1);return true;}}return false;}
export function moveNode(root,id,delta){for(const {node} of flattenNodes(root)){const i=node.children?.findIndex(child=>child.id===id),j=i+delta;if(i>=0&&j>=0&&j<node.children.length){[node.children[i],node.children[j]]=[node.children[j],node.children[i]];return true;}}return false;}
export function isTreeContainer(node){return ['obj','button'].includes(node.type);}
function treeDestination(root,id,targetId,placement){
 const rows=flattenNodes(root),source=rows.find(row=>row.node.id===id),target=rows.find(row=>row.node.id===targetId);
 if(!source?.parent||!target||id===targetId||flattenNodes(source.node).some(row=>row.node.id===targetId))return null;
 let parent,index;
 if(placement==='inside'){if(!isTreeContainer(target.node))return null;parent=target.node;index=parent.children?.length??0;}
 else if(['before','after'].includes(placement)&&target.parent){parent=target.parent;index=parent.children.indexOf(target.node)+(placement==='after'?1:0);}
 else return null;
 const previous=source.parent.children.indexOf(source.node);if(source.parent===parent&&previous<index)index--;
 if(source.parent===parent&&previous===index)return null;
 return {source,parent,index,previous};
}
export function canMoveNodeTo(root,id,targetId,placement){return !!treeDestination(root,id,targetId,placement);}
export function moveNodeTo(root,id,targetId,placement){
 const target=treeDestination(root,id,targetId,placement);if(!target)return false;
 target.source.parent.children.splice(target.previous,1);target.parent.children??=[];target.parent.children.splice(target.index,0,target.source.node);return true;
}
export function parseTracks(text){return text.split(',').map(v=>v.trim()).filter(Boolean).map(v=>{if(v==='content')return 'content';if(/^\d+fr$/.test(v)&&Number(v.slice(0,-2))>0)return {fr:Number(v.slice(0,-2))};if(/^\d+$/.test(v))return Number(v);throw Error('Дорожка: число px, content или 1fr');});}
export function formatTracks(tracks){return Array.isArray(tracks)?tracks.map(v=>typeof v==='object'?v.fr+'fr':v).join(', '):'';}
export {validateScreen} from '@lvgl-cbor/screen-codec';

export function effectiveFlags(node){
 const flags={};for(const [name,bit] of Object.entries(screenContract.flags)){if((node.common?.add_flags??0)&bit)flags[name]=true;if((node.common?.remove_flags??0)&bit)flags[name]=false;}
 return {...flags,...node.flags};
}
export function effectiveProps(node){
 const props={...node.props};if(props.checked===undefined&&['switch','checkbox'].includes(node.type)){if((node.common?.add_state??0)&screenContract.states.CHECKED)props.checked=true;else if((node.common?.remove_state??0)&screenContract.states.CHECKED)props.checked=false;}
 return props;
}
