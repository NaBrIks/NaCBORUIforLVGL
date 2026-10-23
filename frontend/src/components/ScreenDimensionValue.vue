<script setup>
import {ref} from 'vue';
const props=defineProps({modelValue:{default:undefined},name:{type:String,required:true}});
const emit=defineEmits(['update:modelValue','invalid']);
const input=ref(null);
const text=value=>value&&typeof value==='object'?value.pct+'%':value??'';
function commit(event){
 const value=event.target.value.trim();
 if(!value){emit('update:modelValue',undefined);return;}
 if(value==='content'){emit('update:modelValue',value);return;}
 if(/^-?\d+(\.\d+)?%$/.test(value)){emit('update:modelValue',{pct:Number(value.slice(0,-1))});return;}
 if(/^-?\d+$/.test(value)){emit('update:modelValue',Number(value));return;}
 emit('invalid','Размер: целое число px, 100% или content');
}
function clear(){emit('update:modelValue',undefined);input.value.focus();}
</script>
<template>
 <span class="number-editor dimension-editor"><input ref="input" class="style-number" type="text" data-wheel-number="dimension" :aria-label="'Экран '+name" :value="text(modelValue)" data-tooltip="Размер: число пикселей, процент от родителя (100%) или content — по содержимому. Колесо меняет число на 1, Shift — на 10; знак % сохраняется. Пустое поле снимает собственное значение." @input="commit"><button v-if="modelValue!==undefined" class="field-clear" type="button" :aria-label="'Очистить Экран '+name" data-tooltip="Не задавать значение" @mousedown.prevent @click="clear">×</button></span>
</template>
