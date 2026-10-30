<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import ClearableSelect from './ClearableSelect.vue';
import {commitNumberInput} from '../field-input';
import {computed,ref,watch} from 'vue';
import NumberInput from './NumberInput.vue';
const {capabilities,layouts}=useRuntimeCapabilities();
const props=defineProps({modelValue:{default:undefined}});
const emit=defineEmits(['update:modelValue']);
const custom=ref(props.modelValue!==undefined&&![0,1,2].includes(props.modelValue));
watch(()=>props.modelValue,value=>{if(value!==undefined&&![0,1,2].includes(value))custom.value=true;});
const selected=computed(()=>custom.value?'custom':props.modelValue===undefined?'':String(props.modelValue));
function choose(event){
 custom.value=event.target.value==='custom';
 if(!custom.value)emit('update:modelValue',event.target.value===''?undefined:Number(event.target.value));
}
function number(event){commitNumberInput(event,value=>emit('update:modelValue',value));}
</script>
<template>
 <span class="layout-value">
  <ClearableSelect aria-label="layout" :value="selected" @change="choose"><option value="">—</option><option value="0">NONE · вручную</option><option v-if="layouts.includes(1)" value="1">FLEX · поток</option><option v-if="layouts.includes(2)" value="2">GRID · сетка</option><option v-for="id in layouts.filter(id=>id>2)" :key="id" :value="String(id)">ID {{id}}</option><option v-if="!capabilities" value="custom">Свой ID…</option></ClearableSelect>
  <NumberInput v-if="custom" class="style-number" aria-label="layout ID" :value="modelValue??''" :min="0" :max="65535" data-tooltip="Числовой ID, который вернул lv_layout_create() в текущем запуске прошивки. Поле не регистрирует алгоритм. Диапазон контракта: 0…65535." @input="number"/>
 </span>
</template>
