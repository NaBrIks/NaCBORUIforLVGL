// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Keep wheel edits on the normal input path (validation, persistence, CBOR).
import {stepDimensionText} from './field-input';
function onWheel(event){
 const input=event.target;
 if(!(input instanceof HTMLInputElement)||(input.type!=='number'&&input.dataset.wheelNumber!=='dimension')||!input.closest('.visual-editor, .style-controls')||input.disabled||input.readOnly||event.ctrlKey||!event.deltaY)return;
 const previous=input.value;
 const steps=event.shiftKey?10:1;
 if(input.dataset.wheelNumber==='dimension'){
  const next=stepDimensionText(previous,event.deltaY<0?steps:-steps);
  if(next===undefined)return;
  event.preventDefault();input.value=next;
 }else{
  event.preventDefault();
  if(input.value==='')input.value='0';
  try{if(event.deltaY<0)input.stepUp(steps);else input.stepDown(steps);}catch{return;}
 }
 if(input.value!==previous)input.dispatchEvent(new Event('input',{bubbles:true}));
}
document.addEventListener('wheel',onWheel,{passive:false});
if(import.meta.hot)import.meta.hot.dispose(()=>document.removeEventListener('wheel',onWheel));
