// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
const ref=(role,state=[])=>({ref:`global-static:ui.${role}`,part:'MAIN',state});
const source=field=>({source:'ui.display_config',path:[field]});
const label=(id,x,width,field,prefix)=>({id,type:'label',props:{text:'--'},style:{x,y:302,width,height:26},styles:[ref('text')],bindings:[{method:'text',value:source(field),format:{prefix}}],children:[]});
function button(id,text,x,width,action,field,value){
 const node={id,type:'button',props:{text},style:{x,y:334,width,height:52},styles:[ref('button'),ref('button_pressed',['PRESSED']),ref('button_focus',['CHECKED'])],events:[{event:'clicked',action,args:{literal:value}}],children:[]};
 if(field)node.bindings=[{scope:'common',method:'state',value:[{literal:4},{op:'eq',args:[source(field),{literal:value}]}]}];
 return node;
}
export function withDisplaySetup(input){
 const project=structuredClone(input),setup=project.screens.setup;
 if(setup?.size?.width!==800 || setup?.size?.height!==408)throw Error('Expected the existing 800 x 408 Setup page');
 const children=setup.root.children;
 if(children.some(node=>node.id==='display-restart'))return project;
 const sample=children.find(node=>node.id==='sample');
 if(!sample || sample.style.y!==190)throw Error('Existing Setup preview location changed');
 for(const node of children)if(node!==sample && node.style?.y+node.style?.height>302)throw Error('Display controls would overlap existing Setup content');
 sample.style.height=112;
 children.push(
  label('display-active',24,370,'active','Active: '),label('display-draft',405,370,'draft','Draft: '),
  button('display-full','FULL',24,78,'ui.display_mode','mode','FULL'),
  button('display-direct','DIRECT',108,93,'ui.display_mode','mode','DIRECT'),
  button('display-buffer-1','1 buf.',219,76,'ui.display_buffers','buffers',1),
  button('display-buffer-2','2 buf.',301,76,'ui.display_buffers','buffers',2),
  button('display-dirty','Dirty',395,78,'ui.display_transfer','transfer','dirty'),
  button('display-cyclic','Cyclic',479,82,'ui.display_transfer','transfer','cyclic'),
  button('display-restart','Save and restart',579,197,'ui.display_restart',null,null)
 );
 return project;
}
