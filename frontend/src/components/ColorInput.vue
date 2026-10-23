<script setup>
import {computed,ref} from 'vue';
import {colorText,commitColorInput} from '../field-input';
const props=defineProps({name:{type:String,required:true},modelValue:{default:undefined},nullable:{type:Boolean,default:true}});
const emit=defineEmits(['update:modelValue']);
const color=computed(()=>colorText(props.modelValue));
const hexInput=ref(null);
function clear(){hexInput.value.setCustomValidity('');hexInput.value.value='';emit('update:modelValue',undefined);hexInput.value.focus();}
</script>
<template>
 <span class="color-field"><span class="number-editor hex-editor"><input ref="hexInput" :aria-label="name+' HEX'" :value="color" maxlength="7" spellcheck="false" @change="commitColorInput($event,value=>emit('update:modelValue',value))"><button v-if="color" type="button" class="field-clear" :aria-label="'Очистить '+name+' HEX'" data-tooltip="Не задавать значение" @mousedown.prevent @click="clear">×</button></span><input type="color" :aria-label="name+' цвет'" :value="color||'#000000'" :class="{unset:modelValue===undefined}" @input="emit('update:modelValue',$event.target.value)"></span>
</template>
