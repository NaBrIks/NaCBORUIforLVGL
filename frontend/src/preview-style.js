// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {effectiveFlags} from './screen-model.js';
import {normalizeSelector} from '@lvgl-cbor/screen-codec';
import {contract,normalizeProperties} from '@lvgl-cbor/style-codec';
const enumName=(type,value)=>typeof value==='string'?value:Object.entries(contract.enums[type]??{}).find(([,v])=>v===value)?.[0]??'';
const px=value=>typeof value==='object'&&value!==null?value.pct+'%':value==='content'?'max-content':typeof value==='number'?value+'px':value;
const rgba=(color='#000000',opa=255)=>/^#[\da-f]{6}$/i.test(color)?color+Math.round(Math.max(0,Math.min(255,opa))).toString(16).padStart(2,'0'):color;
const place=value=>({START:'flex-start',END:'flex-end',CENTER:'center',SPACE_EVENLY:'space-evenly',SPACE_AROUND:'space-around',SPACE_BETWEEN:'space-between',STRETCH:'stretch'})[String(value).replace(/^LV_(FLEX|GRID)_ALIGN_/,'')]??'flex-start';
export function layoutName(value){return typeof value==='string'?value:value===1?'LV_LAYOUT_FLEX':value===2?'LV_LAYOUT_GRID':'LV_LAYOUT_NONE';}
export function resolvedStyle(node,screen,projectStyles={},states=[]){
 const result={};
 const canonical=values=>{try{values=normalizeProperties(values??{});}catch{}const out={};for(const [key,value] of Object.entries(values??{})){const method=contract.methods.find(m=>m.alias===key);if(method?.properties.length>1)method.properties.forEach((name,i)=>out[name]=method.parameters.length>1?value[i]:value);}for(const [key,value] of Object.entries(values??{})){const method=contract.methods.find(m=>m.alias===key);if(!method||method.properties.length===1)out[key]=value;}return out;};
 const visiting=new Set();
 const shared=name=>{if(visiting.has(name))return {};visiting.add(name);const definition=projectStyles[name],out={};if(definition){for(const ref of [definition.copy,...(definition.merge??[])])if(/^(global|global-dynamic):/.test(ref??''))Object.assign(out,shared(ref.slice(ref.indexOf(':')+1)));Object.assign(out,canonical(definition.props));}visiting.delete(name);return out;};
  for(const use of node.styles??[]){const selector=normalizeSelector(use);if(selector.part!=='MAIN'||!selector.state.every(state=>states.includes(state)))continue;if(/^(global|global-dynamic):/.test(use.ref??''))Object.assign(result,shared(use.ref.slice(use.ref.indexOf(':')+1)));else{const key=use.ref?.replace(/^screen:/,'');Object.assign(result,canonical(screen?.styles?.[key]?.props));}}
 Object.assign(result,canonical(node.style));
  for(const rule of node.styleRules??[])if(normalizeSelector(rule).part==='MAIN'&&normalizeSelector(rule).state.every(state=>states.includes(state)))Object.assign(result,canonical(rule.props));
 return result;
}
export function previewStyle(node,{root=false,mounted=false,parentLayout='LV_LAYOUT_NONE',screen,projectStyles,states=[],showHidden=false,hiddenAncestor=false,nativeSize}={}){
  const p=resolvedStyle(node,screen,projectStyles,states),type=node.type,flags=effectiveFlags(node);
 const layout=layoutName(p.layout),flow=typeof p.flex_flow==='number'?'LV_FLEX_FLOW_'+((p.flex_flow&1)?'COLUMN':'ROW')+((p.flex_flow&4)?'_WRAP':'')+((p.flex_flow&8)?'_REVERSE':''):enumName('lv_flex_flow_t',p.flex_flow??0);
 const css={position:root?'relative':parentLayout==='LV_LAYOUT_NONE'||flags.IGNORE_LAYOUT||flags.FLOATING?'absolute':'relative',boxSizing:'border-box',flexShrink:0,minWidth:0,minHeight:0,color:'inherit',fontFamily:'inherit',fontSize:'inherit',lineHeight:1.2};
 const defaults={obj:[100,70],label:['max-content','max-content'],button:['max-content','max-content'],bar:[200,20],slider:[200,20],arc:[120,120],line:[160,60],image:[120,80],checkbox:['max-content','max-content'],switch:[50,26],textarea:[200,80],dropdown:[160,30]};
 [css.width,css.height]=(nativeSize?[nativeSize.width,nativeSize.height]:defaults[type]??defaults.obj).map(px);
 if(type==='button')Object.assign(css,{padding:'8px 16px',backgroundColor:'#2196f3',borderRadius:'6px',color:'#ffffff'});
 if(type==='obj')Object.assign(css,{backgroundColor:screen?.theme==='none'?'transparent':'#ffffff'});
 for(const [name,key] of Object.entries({width:'width',height:'height',min_width:'minWidth',max_width:'maxWidth',min_height:'minHeight',max_height:'maxHeight',radius:'borderRadius',text_letter_space:'letterSpacing',outline_width:'outlineWidth',outline_pad:'outlineOffset'}))if(p[name]!==undefined)css[key]=px(p[name]);
 for(const side of ['top','right','bottom','left']){
  const pad=p['pad_'+side]??p.pad_all,margin=p['margin_'+side]??p.margin_all;
  if(pad!==undefined)css['padding'+side[0].toUpperCase()+side.slice(1)]=px(pad);
  if(margin!==undefined)css['margin'+side[0].toUpperCase()+side.slice(1)]=px(margin);
 }
 if(p.bg_color!==undefined||p.bg_opa!==undefined)css.backgroundColor=rgba(p.bg_color??'#ffffff',p.bg_opa??255);
 if(p.bg_grad_color!==undefined){const dir=enumName('lv_grad_dir_t',p.bg_grad_dir);if(!dir.endsWith('_NONE'))css.backgroundImage=`linear-gradient(${dir.endsWith('_HOR')?'to right':'to bottom'},${rgba(p.bg_color??'#ffffff',p.bg_main_opa??255)} ${(p.bg_main_stop??0)/2.55}%,${rgba(p.bg_grad_color,p.bg_grad_opa??255)} ${(p.bg_grad_stop??255)/2.55}%)`;}
 css.borderStyle='solid';css.borderWidth=px(p.border_width??0);css.borderColor=rgba(p.border_color??'#000000',p.border_opa??255);
 if(p.border_side!==undefined){const sides=typeof p.border_side==='number'?p.border_side:contract.enums.lv_border_side_t?.[p.border_side]??15;for(const [side,bit] of [['Bottom',1],['Top',2],['Left',4],['Right',8]])if(!(sides&bit))css['border'+side+'Width']='0px';}
 css.outlineStyle='solid';css.outlineWidth=px(p.outline_width??0);css.outlineColor=rgba(p.outline_color??'#000000',p.outline_opa??255);
 if(p.shadow_width)css.boxShadow=`${p.shadow_offset_x??0}px ${p.shadow_offset_y??0}px ${Math.max(0,p.shadow_width)/2}px ${p.shadow_spread??0}px ${rgba(p.shadow_color??'#000000',p.shadow_opa??255)}`;
 const filters=[];
 if((p.drop_shadow_opa??0)>0)filters.push(`drop-shadow(${p.drop_shadow_offset_x??0}px ${p.drop_shadow_offset_y??0}px ${Math.max(0,p.drop_shadow_radius??0)}px ${rgba(p.drop_shadow_color??'#000000',p.drop_shadow_opa)})`);
 if(p.blur_radius)filters.push(`blur(${Math.max(0,p.blur_radius)}px)`);if(filters.length)css.filter=filters.join(' ');
 if(p.text_color!==undefined)css.color=rgba(p.text_color,p.text_opa??255);
 if(p.text_font)css.fontSize=(String(p.text_font).match(/_(\d+)$/)?.[1]??14)+'px';
 if(p.text_align!==undefined)css.textAlign=enumName('lv_text_align_t',p.text_align).replace('LV_TEXT_ALIGN_','').toLowerCase();
 if(p.text_line_space!==undefined)css.lineHeight=`calc(1.2em + ${p.text_line_space}px)`;
 if(p.text_decor){const value=typeof p.text_decor==='number'?p.text_decor:contract.enums.lv_text_decor_t?.[p.text_decor]??0;css.textDecoration=[value&1?'underline':'',value&2?'line-through':''].filter(Boolean).join(' ');}
 css.opacity=(p.opa??p.opa_layered??255)/255;
  css.overflow=flags.OVERFLOW_VISIBLE?'visible':flags.SCROLLABLE?'auto':type==='label'||flags.SCROLLABLE===false?'hidden':'visible';
 if(!root&&css.position==='absolute'){
  const align=enumName('lv_align_t',p.align),x=p.x??0,y=p.y??0;
  const horizontal=align.includes('RIGHT')?'right':align.includes('MID')||align.endsWith('_CENTER')?'center':'left';
  const vertical=align.includes('BOTTOM')?'bottom':align.includes('LEFT_MID')||align.includes('RIGHT_MID')||align.endsWith('_CENTER')?'center':'top';
  css.left=horizontal==='center'?`calc(50% + ${px(x)})`:horizontal==='right'?`calc(100% + ${px(x)})`:px(x);
  css.top=vertical==='center'?`calc(50% + ${px(y)})`:vertical==='bottom'?`calc(100% + ${px(y)})`:px(y);
  css.translate=`${horizontal==='left'?'0':'-100%'} ${vertical==='top'?'0':'-100%'}`;
  if(horizontal==='center'||vertical==='center')css.translate=`${horizontal==='center'?'-50%':horizontal==='right'?'-100%':'0'} ${vertical==='center'?'-50%':vertical==='bottom'?'-100%':'0'}`;
 }
 const transforms=[];
 if(p.translate_x||p.translate_y)transforms.push(`translate(${px(p.translate_x??0)},${px(p.translate_y??0)})`);
 if(p.transform_rotation)transforms.push(`rotate(${p.transform_rotation/10}deg)`);
 if(p.transform_scale_x!==undefined||p.transform_scale_y!==undefined)transforms.push(`scale(${(p.transform_scale_x??256)/256},${(p.transform_scale_y??256)/256})`);
 if(p.transform_skew_x||p.transform_skew_y)transforms.push(`skew(${(p.transform_skew_x??0)/10}deg,${(p.transform_skew_y??0)/10}deg)`);
 if(transforms.length)css.transform=transforms.join(' ');
 css.transformOrigin=`${px(p.transform_pivot_x??0)} ${px(p.transform_pivot_y??0)}`;
 css.rowGap=px(p.pad_row??0);css.columnGap=px(p.pad_column??0);
 if(layout==='LV_LAYOUT_FLEX')Object.assign(css,{display:'flex',flexDirection:flow.includes('COLUMN')?'column'+(flow.includes('REVERSE')?'-reverse':''):'row'+(flow.includes('REVERSE')?'-reverse':''),flexWrap:flow.includes('WRAP')?'wrap':'nowrap',justifyContent:place(enumName('lv_flex_align_t',p.flex_main_place??0)),alignItems:place(enumName('lv_flex_align_t',p.flex_cross_place??0)),alignContent:place(enumName('lv_flex_align_t',p.flex_track_place??0))});
 if(p.flex_grow!==undefined)css.flexGrow=p.flex_grow;
 if(layout==='LV_LAYOUT_GRID'){
  const tracks=value=>Array.isArray(value)?value.map(v=>v==='content'?'max-content':typeof v==='object'?`minmax(0, ${v.fr}fr)`:px(v)).join(' '):'none';
  Object.assign(css,{display:'grid',gridTemplateColumns:tracks(p.grid_column_dsc_array),gridTemplateRows:tracks(p.grid_row_dsc_array),justifyContent:place(enumName('lv_grid_align_t',p.grid_column_align??0)),alignContent:place(enumName('lv_grid_align_t',p.grid_row_align??0))});
 }
 if(parentLayout==='LV_LAYOUT_GRID'){
  css.gridColumn=`${(p.grid_cell_column_pos??0)+1} / span ${Math.max(1,p.grid_cell_column_span??1)}`;css.gridRow=`${(p.grid_cell_row_pos??0)+1} / span ${Math.max(1,p.grid_cell_row_span??1)}`;
  for(const [name,key,size] of [['grid_cell_x_align','justifySelf','width'],['grid_cell_y_align','alignSelf','height']]){const align=enumName('lv_grid_align_t',p[name]??0);css[key]=place(align);if(align.endsWith('STRETCH'))css[size]='auto';}
 }
  if(root){Object.assign(css,{width:'100%',height:'100%',position:'relative'});if(!mounted)for(const key of ['minWidth','minHeight','maxWidth','maxHeight'])delete css[key];}
 if(flags.HIDDEN){
  if(!showHidden)css.display='none';
  else if(!hiddenAncestor)css.opacity*=.25;
 }
 return css;
}
const supported=new Set(('x y align width height min_width max_width min_height max_height pad_all margin_all pad_top pad_right pad_bottom pad_left margin_top margin_right margin_bottom margin_left radius bg_color bg_opa bg_grad_color bg_grad_dir bg_main_opa bg_grad_opa bg_main_stop bg_grad_stop border_width border_color border_opa border_side outline_width outline_color outline_opa outline_pad shadow_width shadow_offset_x shadow_offset_y shadow_spread shadow_color shadow_opa drop_shadow_radius drop_shadow_offset_x drop_shadow_offset_y drop_shadow_color drop_shadow_opa text_color text_opa text_font text_align text_letter_space text_line_space text_decor opa opa_layered blur_radius translate_x translate_y transform_rotation transform_scale_x transform_scale_y transform_pivot_x transform_pivot_y transform_skew_x transform_skew_y layout flex_flow flex_main_place flex_cross_place flex_track_place flex_grow pad_row pad_column grid_column_dsc_array grid_row_dsc_array grid_column_align grid_row_align grid_cell_column_pos grid_cell_column_span grid_cell_row_pos grid_cell_row_span grid_cell_x_align grid_cell_y_align line_width line_color line_opa line_rounded arc_width arc_color arc_opa').split(' '));
export function unsupportedProperties(node,screen,projectStyles){return Object.keys(resolvedStyle(node,screen,projectStyles)).filter(name=>!supported.has(name));}
