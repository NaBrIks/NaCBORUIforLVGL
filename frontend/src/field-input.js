// One input contract for every editor: empty unsets, zero is a value,
// incomplete/invalid typing must not replace the last accepted value.
export function readNumberInput(input){
 if(input.value==='')return input.validity.badInput?{accepted:false}:{accepted:true,value:undefined};
 return input.validity.valid&&Number.isInteger(input.valueAsNumber)
  ?{accepted:true,value:input.valueAsNumber}:{accepted:false};
}
export function commitNumberInput(event,commit){
 const result=readNumberInput(event.target);
 if(result.accepted)commit(result.value);
 return result.accepted;
}
export function commitColorInput(event,commit){
 const input=event.target,value=input.value.trim();
 if(!value||/^#[0-9a-f]{6}$/i.test(value)){
  input.setCustomValidity('');commit(value||undefined);return true;
 }
 input.setCustomValidity('Формат #RRGGBB');input.reportValidity();return false;
}
export function colorText(value,fallback=''){
 return typeof value==='number'?'#'+value.toString(16).padStart(6,'0'):value??fallback;
}
export function toggleFlags(value,mask,on){return mask===0?0:on?(Number(value)||0)|mask:(Number(value)||0)&~mask;}
export function stepDimensionText(text,steps){
 const value=text.trim();
 if(!value)return String(steps);
 const match=value.match(/^(-?\d+(?:\.\d+)?)(%?)$/);
 if(!match||(!match[2]&&!Number.isInteger(Number(match[1]))))return undefined;
 const next=Math.max(-2147483648,Math.min(2147483647,Number(match[1])+steps));
 return String(Number(next.toFixed(6)))+match[2];
}
