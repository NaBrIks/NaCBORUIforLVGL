import {decodeNodeCommands} from './command-stream.js';
import {contract,decodeMethods} from '@lvgl-cbor/style-codec';
import {text,object as only} from '@lvgl-cbor/style-codec/values';
import {screenContract} from './contract.js';
import {decodeSelector} from './selectors.js';
import {decodeWidgetMethods} from './widget-methods.js';
import {decodeScreenPacket} from './wire.js';
import {widgetCatalog} from './widget-catalog.js';
import {encodeScreen} from './encode.js';
import {decodeBindings} from './bindings.js';
import {decodeViews} from './composition.js';
export function decodeScreen(bytes,capabilities){
 const widgets=widgetCatalog(capabilities);
 const packet=decodeScreenPacket(bytes);
 if(!(packet instanceof Map)||packet.get('v')!==screenContract.version||packet.get('kind')!=='screen'||packet.get('abi')!==screenContract.sha256||packet.get('style_abi')!==contract.sha256)throw Error('Screen packet ABI/version');
 const data=Object.fromEntries(packet);only(data,['v','kind','id','abi','style_abi','name','title','size','theme','styles','root','bindings','events','bindings_version','captions','views_version','views'],'Screen envelope');
 text(data.id,47,'Request ID');
 if(data.captions!==undefined&&!(data.captions instanceof Map))throw Error('Caption metadata');
 const node=wire=>{
  if(!(wire instanceof Map))throw Error('Screen node');const n=Object.fromEntries(wire);only(n,['id','type','common','widget','style','styles','rules','children','bindings','caption','extension'],'Node fields');
  const family=widgets.find(w=>w.id===n.type);if(!family)throw Error('Widget ID');if(family.abi!==n.extension)throw Error('Extension ABI mismatch');
  const out={id:n.id,type:family.name,props:decodeWidgetMethods(n.widget??new Map(),family),flags:{},styles:[],children:[]};
  if(n.style!==undefined)out.style=decodeMethods(n.style);
  const common=decodeWidgetMethods(n.common??new Map(),screenContract.common);
  if(Object.keys(common).length)out.common=common;
  out.styles=(n.styles??[]).map(use=>{const u=Object.fromEntries(use);only(u,['ref','selector'],'Style use');return {ref:u.ref,...decodeSelector(u.selector??0)};});
  if(n.rules!==undefined)out.styleRules=n.rules.map(rule=>{const r=Object.fromEntries(rule);only(r,['selector','methods'],'Style rule');return {...decodeSelector(r.selector??0),props:decodeMethods(r.methods)};});
  if(n.bindings!==undefined&&(!Array.isArray(n.bindings)||n.bindings.length))throw Error('Bindings not implemented');
  out.children=(n.children??[]).map(node);
  if(n.caption!==undefined){text(n.caption,63,'Caption ID');const index=out.children.findIndex(child=>child.id===n.caption),caption=out.children[index];
   if(out.type!=='button'||!caption||caption.type!=='label'||typeof caption.props.text!=='string'||Object.keys(caption.props).length!==1||Object.keys(caption.common??{}).length||caption.styles.length||caption.styleRules?.length||caption.children.length||Object.keys(caption.style??{}).length!==1||caption.style.align!==contract.enums.lv_align_t.LV_ALIGN_CENTER)throw Error('Invalid generated Button caption');
   out.props.text=caption.props.text;out.children.splice(index,1);
  }
  return out;
 };
 if(!Array.isArray(data.size)||data.size.length!==2)throw Error('Screen size');
 const styles={};for(const wire of data.styles??[]){const style=Object.fromEntries(wire);only(style,['id','methods'],'Style definition');text(style.id,63,'Style ID');if(Object.hasOwn(styles,style.id))throw Error('Duplicate style ID');Object.defineProperty(styles,style.id,{enumerable:true,configurable:true,writable:true,value:{props:decodeMethods(style.methods)}});}
 if(data.theme!==undefined&&typeof data.theme!=='boolean')throw Error('Theme boolean');
 const doc={format:'lvgl-screen-draft-1',id:data.name,name:data.title??data.name,size:{width:data.size[0],height:data.size[1]},theme:data.theme===false?'none':'device',styles,root:node(decodeNodeCommands(data.root,widgets,data.captions??new Map())),bindings:[]};
 decodeViews(data,doc);decodeBindings(data,doc,widgets);encodeScreen(doc,data.id,capabilities);return doc;
}
