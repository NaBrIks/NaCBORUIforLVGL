<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
import {dataDescriptor,defaultDataValue,literalSchema,bindingLimits} from '@lvgl-cbor/screen-codec';
import Icon from '../../components/Icon.vue';
import {hasObjectField,toggleObjectField,initialDataValue} from './binding-model.js';
const props=defineProps({schema:[String,Object],capabilities:Object,modelValue:null,label:{type:String,default:'Значение'}}),emit=defineEmits(['update:modelValue']);
const limits=computed(()=>bindingLimits(props.capabilities));
const spec=computed(()=>dataDescriptor(props.schema??literalSchema(props.modelValue??'')));
const sequence=computed(()=>Array.isArray(props.modelValue)?props.modelValue:defaultDataValue(spec.value));
const objectFields=computed(()=>({...spec.value.fields,...Object.fromEntries(Object.keys(props.modelValue??{}).map(key=>[key,spec.value.fields?.[key]]))}));
function item(index,value){const next=[...sequence.value];next[index]=value;emit('update:modelValue',next);}
function field(key,enabled){emit('update:modelValue',toggleObjectField(props.modelValue,key,enabled,()=>initialDataValue(objectFields.value[key])));}
function number(event){if(event.target.value===''||event.target.validity.badInput||!Number.isFinite(event.target.valueAsNumber))return;emit('update:modelValue',event.target.valueAsNumber);}
</script>
<template>
 <div v-if="spec.type==='object'" class="binding-data-fields"><div v-for="(fieldSchema,key) in objectFields" :key="key" class="binding-data-field"><label class="binding-field-label"><input type="checkbox" :aria-label="label+' / '+key+' задано'" :checked="hasObjectField(modelValue,key)" @change="field(key,$event.target.checked)"><span :title="key">{{dataDescriptor(fieldSchema)?.title??key}}</span></label><DataValueInput v-if="hasObjectField(modelValue,key)" :capabilities="capabilities" :schema="fieldSchema" :model-value="modelValue[key]" :label="label+' / '+key" @update:model-value="emit('update:modelValue',{...modelValue,[key]:$event})"/><span v-else class="binding-field-absent">Не задано</span></div></div>
 <div v-else-if="spec.type==='array'||spec.type==='tuple'" class="binding-data-fields"><div v-for="(value,index) in sequence" :key="index" class="binding-data-field"><label>{{spec.type==='tuple'?(dataDescriptor(spec.items[index]).title??index+1):index+1}}</label><DataValueInput :capabilities="capabilities" :schema="spec.type==='tuple'?spec.items[index]:spec.items" :model-value="value" :label="label+' / '+(index+1)" @update:model-value="item(index,$event)"/><button v-if="spec.type==='array'" class="action-button icon-action" :disabled="sequence.length<=(spec.minItems??0)" :aria-label="label+' удалить '+(index+1)" data-tooltip="Удалить элемент" @click="emit('update:modelValue',sequence.filter((_,i)=>i!==index))"><Icon name="trash"/></button></div><button v-if="spec.type==='array'" class="action-button icon-action" :disabled="sequence.length>=(spec.maxItems??limits.arrayItems)" :aria-label="label+' добавить элемент'" data-tooltip="Добавить элемент массива" @click="emit('update:modelValue',[...sequence,initialDataValue(spec.items)])"><Icon name="plus"/></button></div>
 <input v-else-if="spec.type==='bool'" type="checkbox" :aria-label="label" :checked="modelValue===true" @change="emit('update:modelValue',$event.target.checked)">
 <select v-else-if="spec.values" :aria-label="label" :value="modelValue" @change="emit('update:modelValue',Number($event.target.value))"><option v-for="(value,index) in spec.values" :key="value" :value="value">{{spec.labels?.[index]??value}}</option></select>
 <span v-else-if="spec.type==='null'" class="muted">null</span>
 <input v-else-if="spec.type==='text'" :aria-label="label" :value="modelValue??''" @input="emit('update:modelValue',$event.target.value)">
 <input v-else type="number" :aria-label="label" :min="spec.min" :max="spec.max" :step="spec.type==='integer'?'1':'any'" :value="modelValue" @input="number">
</template>
