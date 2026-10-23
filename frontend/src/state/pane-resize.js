import {ref,computed,onBeforeUnmount} from 'vue';
export function usePaneResize(page){
 const styleWidth=ref(700),screenWidth=ref(700),columns=ref(null);
 const inspectorWidth=computed({get:()=>page.value==='screens'?screenWidth.value:styleWidth.value,set:value=>{if(page.value==='screens')screenWidth.value=value;else styleWidth.value=value;}});
 const inspectorMin=computed(()=>['screens','styles'].includes(page.value)?620:260),inspectorMax=computed(()=>Math.max(inspectorMin.value,(columns.value?.clientWidth??1200)-280));
 function setInspectorWidth(value){inspectorWidth.value=Math.max(inspectorMin.value,Math.min(inspectorMax.value,value));}
 let cleanup;
 function startResize(event){const el=event.currentTarget,start=event.clientX,width=columns.value.querySelector('.lab-main').clientWidth;el.setPointerCapture(event.pointerId);const move=e=>setInspectorWidth(width+e.clientX-start);cleanup=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',cleanup);el.removeEventListener('pointercancel',cleanup);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',cleanup);el.addEventListener('pointercancel',cleanup);}
 onBeforeUnmount(()=>cleanup?.());
 return {columns,inspectorWidth,inspectorMin,inspectorMax,startResize,setInspectorWidth};
}
