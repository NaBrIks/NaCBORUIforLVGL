<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {ref} from 'vue';
defineOptions({inheritAttrs:false});
defineProps({value:{default:''},min:{default:undefined},max:{default:undefined},step:{default:1}});
const emit=defineEmits(['input']);
const input=ref(null);
function clear(){if(!input.value)return;input.value.value='';input.value.dispatchEvent(new Event('input',{bubbles:true}));input.value.focus();}
</script>
<template>
 <span class="number-editor"><input ref="input" v-bind="$attrs" type="number" :value="value" :min="min" :max="max" :step="step" @input="emit('input',$event)"><button v-if="value!==''&&value!==undefined&&value!==null" type="button" class="field-clear" :aria-label="'Очистить '+($attrs['aria-label']??'значение')" data-tooltip="Не задавать значение" @mousedown.prevent @click="clear">×</button></span>
</template>
