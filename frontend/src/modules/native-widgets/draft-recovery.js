import {validateScreen,inspectExpression,validateNavigation} from '@lvgl-cbor/screen-codec';
// An unavailable native implementation must not discard all saved screens on reload.
// Only recovery uses a skeleton; sending always validates the untouched document.
export function recoverableNativeDraft(document){
 try{
  const skeleton=JSON.parse(JSON.stringify(document));let native=false,count=0;
  const walk=(node,depth)=>{
   if(!node||typeof node.type!=='string'||depth>12||++count>128||node.children!==undefined&&!Array.isArray(node.children))throw Error('Node structure');
   if(node.type.includes(':')){
    if(node.props!==undefined&&(!node.props||typeof node.props!=='object'||Array.isArray(node.props)))throw Error('Native props');
    if(node.bindings!==undefined&&!Array.isArray(node.bindings)||node.events!==undefined&&!Array.isArray(node.events))throw Error('Native rules');
    for(const rule of node.bindings??[])inspectExpression(rule.value);
    for(const rule of node.events??[])if(rule.navigate)validateNavigation(rule.navigate);else inspectExpression(rule.write?rule.value:rule.args,{eventContext:true});
    delete node.bindings;delete node.events;
    native=true;node.type='obj';node.props={};
   }
   for(const child of node.children??[])walk(child,depth+1);
  };
  walk(skeleton.root,1);return native&&!validateScreen(skeleton).length;
 }catch{return false;}
}
