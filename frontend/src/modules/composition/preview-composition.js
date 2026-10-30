// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {compositionLimits,screenViews} from '@lvgl-cbor/screen-codec';
import {reactive} from 'vue';

// Browser-only active projection. It never invokes application actions or writes data.
export function createCompositionPreview(screen,screens={},capabilities){
 const limits=compositionLimits(capabilities),definitions={...screens,[screen.id]:screen};let serial=0;
 const model=reactive({root:null,selection:null});
 function create(document,depth,budget,ancestry=[],parent=null){
  if(depth>limits.maxDepth||budget.left--<=0)throw Error('Composition depth/instance limit');
  if(ancestry.includes(document.id))throw Error('Recursive initial views');
  const instance={id:++serial,screen:document,depth,parent,views:{}};
  for(const view of screenViews(document)){const slot={selected:view.initial,child:null,error:''};instance.views[view.node]=slot;try{const child=definitions[view.initial];if(!child)throw Error('Страница не найдена: '+view.initial);slot.child=create(child,depth+1,budget,[...ancestry,document.id],instance.id);}catch(error){slot.error=error.message;}}
  return instance;
 }
 model.root=create(screen,1,{left:limits.maxInstances});
 const all=()=>{const out=[];function walk(instance){out.push(instance);for(const slot of Object.values(instance.views))if(slot.child)walk(slot.child);}walk(model.root);return out;};
 model.instances=all;
 model.checked=(instance,node)=>(node.events??[]).some(rule=>rule.navigate&&instance.views[rule.navigate.view]?.selected===rule.navigate.screen);
 model.navigate=(id,target)=>{
  const existing=all(),instance=existing.find(value=>value.id===id),declaration=screenViews(instance?.screen).find(view=>view.node===target.view),slot=instance?.views[target.view];if(!slot)return false;
  slot.selected=target.screen;slot.error='';slot.child=null;
  try{if(!declaration.pages.some(page=>page.screen===target.screen))throw Error('Недопустимая страница: '+target.screen);const ancestry=[];for(let owner=instance;owner;owner=existing.find(value=>value.id===owner.parent)){ancestry.push(owner.screen.id);if(owner.screen.id===target.screen)throw Error('Цикл вложенных страниц');}const document=definitions[target.screen];if(!document)throw Error('Страница не найдена: '+target.screen);slot.child=create(document,instance.depth+1,{left:limits.maxInstances-all().length},ancestry,instance.id);return true;}catch(error){slot.error=error.message;return false;}
 };
 return model;
}
