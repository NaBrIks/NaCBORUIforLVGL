<script setup>
import {computed,ref,watch} from 'vue';
import {methodSchema,parameterType,defaultParameter,encodeWidgetMethod} from '@lvgl-cbor/screen-codec';
import ParameterInput from './ParameterInput.vue';
const props=defineProps({family:{type:Object,required:true},method:{type:Object,required:true},modelValue:null});
const emit=defineEmits(['update:modelValue']);
const schema=computed(()=>methodSchema(props.method)),error=ref(''),draft=ref();
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
watch(()=>props.modelValue,value=>{draft.value=copy(value??props.family.defaults?.[props.method.alias]??defaultParameter(schema.value));error.value='';},{immediate:true,deep:true});
function update(value){draft.value=value;try{const result=encodeWidgetMethod(props.family,props.method.alias,value)[1];error.value='';emit('update:modelValue',result);}catch(e){error.value=e.message;}}
</script>
<template><div class="native-method">
 <div class="native-method-heading"><label :data-tooltip="method.alias">{{method.title??method.alias}}</label><code>{{method.alias}} · {{method.opcode}}</code><button :disabled="modelValue===undefined" :aria-label="'Убрать метод '+method.alias" data-tooltip="Не передавать метод; останется значение фабрики" @click="error='';emit('update:modelValue',undefined)">×</button></div>
 <small class="native-method-type">{{parameterType(schema)}}</small>
 <ParameterInput :schema="schema" :model-value="draft" :label="family.name+' '+method.alias" @update:model-value="update"/>
 <p v-if="error" class="bad" role="alert">{{error}}</p>
</div></template>
