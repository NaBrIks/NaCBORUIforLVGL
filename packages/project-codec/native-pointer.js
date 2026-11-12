// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Presentation/controller only. The injected sender owns transport and its deadline.
export function mapContainedPointer(rect,width,height,clientX,clientY,{clamp=false}={}){
 if(![rect?.left,rect?.top,rect?.width,rect?.height,clientX,clientY].every(Number.isFinite)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||rect.width<=0||rect.height<=0)return null;
 const scale=Math.min(rect.width/width,rect.height/height),drawWidth=width*scale,drawHeight=height*scale;
 const left=rect.left+(rect.width-drawWidth)/2,top=rect.top+(rect.height-drawHeight)/2;
 if(!clamp&&(clientX<left||clientY<top||clientX>=left+drawWidth||clientY>=top+drawHeight))return null;
 return {x:Math.max(0,Math.min(width-1,Math.floor((clientX-left)/scale))),y:Math.max(0,Math.min(height-1,Math.floor((clientY-top)/scale)))};
}
export function createPointerController({send,onError=()=>{},setInterval:repeat=globalThis.setInterval,clearInterval:stop=globalThis.clearInterval,maxQueued=8,holdMs=150}={}){
 if(typeof send!=='function'||!Number.isInteger(maxQueued)||maxQueued<2||maxQueued>64)throw Error('Invalid pointer controller');
 const queue=[];let pointer=null,last={x:0,y:0},hold=null,busy=false,disposed=false,possiblyPressed=false,closingRelease=false;
 const stopHold=()=>{if(hold!==null)stop(hold);hold=null;};
 const error=e=>{try{Promise.resolve(onError(e)).catch(()=>{});}catch{}};
 const valid=point=>point&&Number.isInteger(point.x)&&Number.isInteger(point.y)&&point.x>=0&&point.y>=0&&point.x<=8191&&point.y<=8191;
 async function drain(){
  if(busy)return;busy=true;
  try{
   while(queue.length){
    const {edge,...state}=queue.shift();
    if(state.pressed)possiblyPressed=true;
    await send(state);
    if(!state.pressed)possiblyPressed=false;
   }
  }catch(e){
   queue.length=0;pointer=null;stopHold();error(e);
   // A failed/aborted press has an unknown outcome. Release once, never retry
   // the press. The target watchdog is the final protection on lost transport.
   if(possiblyPressed){possiblyPressed=false;try{await send({...last,pressed:false});}catch{}}
  }finally{busy=false;if(closingRelease&&possiblyPressed){closingRelease=false;queue.push({...last,pressed:false,edge:true});void drain();}}
 }
 function enqueue(pressed,edge){
  const state={...last,pressed,edge},previous=queue.at(-1);
  if(!edge&&previous&&!previous.edge)queue[queue.length-1]=state;
  else if(edge||queue.length<maxQueued-1)queue.push(state);
  void drain();
 }
 function release(id,point){
  if(pointer===null||id!==undefined&&id!==pointer)return false;
  if(valid(point))last={...point};pointer=null;stopHold();enqueue(false,true);return true;
 }
 return {
  down(id,point){
   if(disposed||pointer!==null||!Number.isInteger(id)||id<0||!valid(point)||queue.length>=maxQueued-1)return false;
   pointer=id;last={...point};hold=repeat(()=>{if(pointer!==null)enqueue(true,false);},holdMs);enqueue(true,true);return true;
  },
  move(id,point){if(disposed||id!==pointer||pointer===null||!valid(point))return false;last={...point};enqueue(true,false);return true;},
  release,
  dispose(){if(disposed)return;disposed=true;release();stopHold();
   // Drop unsubmitted gestures/moves while retaining a terminal release after
   // an in-flight press. Do not abandon the release merely because UI unmounted.
   queue.length=0;if(possiblyPressed){queue.push({...last,pressed:false,edge:true});closingRelease=true;void drain();}
  },
  get activePointer(){return pointer;},get pending(){return queue.length;}
 };
}
export function bindPreviewPointer(element,send,{width=0,height=0,enabled=false,onError=()=>{},eventTarget=globalThis.window,documentTarget=globalThis.document}={}){
 if(!element?.addEventListener)throw Error('Preview surface is required');
 const controller=createPointerController({send,onError});let disposed=false,options={width,height,enabled};const oldTouch=element.style?.touchAction;
 function bounds(){
  const rect=element.getBoundingClientRect(),style=globalThis.getComputedStyle?.(element),number=name=>parseFloat(style?.[name])||0;
  const left=number('borderLeftWidth')+number('paddingLeft'),top=number('borderTopWidth')+number('paddingTop');
  return {left:rect.left+left,top:rect.top+top,width:rect.width-left-number('borderRightWidth')-number('paddingRight'),height:rect.height-top-number('borderBottomWidth')-number('paddingBottom')};
 }
 const position=(event,clamp=false)=>mapContainedPointer(bounds(),options.width,options.height,event.clientX,event.clientY,{clamp});
 function captureOff(id){try{if(id!==null&&element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{}}
 function release(event){const id=controller.activePointer;if(controller.release(event?.pointerId,event?.type==='pointerup'?position(event,true):undefined)){captureOff(id);event?.preventDefault?.();}}
 function down(event){
  if(disposed||!options.enabled||event.button!==0||event.isPrimary===false||documentTarget?.hidden)return;
  const point=position(event);if(!point)return;
  if(controller.down(event.pointerId,point)){try{element.setPointerCapture?.(event.pointerId);}catch{release();}event.preventDefault();}
 }
 function move(event){if(controller.move(event.pointerId,position(event,true)))event.preventDefault();}
 const hidden=()=>{if(documentTarget?.hidden)release();},blur=()=>release(),context=event=>{if(options.enabled)event.preventDefault();};
 const events={pointerdown:down,pointermove:move,pointerup:release,pointercancel:release,lostpointercapture:release,contextmenu:context};
 for(const [name,callback] of Object.entries(events))element.addEventListener(name,callback);
 eventTarget?.addEventListener('blur',blur);documentTarget?.addEventListener('visibilitychange',hidden);
 function update(next){if(disposed)return;if(!next.enabled||next.width!==options.width||next.height!==options.height)release();options={...options,...next};if(element.style)element.style.touchAction=options.enabled?'none':oldTouch??'';}
 update(options);
 return {update,dispose(){if(disposed)return;release();disposed=true;controller.dispose();for(const [name,callback] of Object.entries(events))element.removeEventListener(name,callback);eventTarget?.removeEventListener('blur',blur);documentTarget?.removeEventListener('visibilitychange',hidden);if(element.style)element.style.touchAction=oldTouch??'';}};
}
