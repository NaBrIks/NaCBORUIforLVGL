<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
import {defaultParameter,screenContract} from '@lvgl-cbor/screen-codec';
import Icon from '../../components/Icon.vue';
const props=defineProps({schema:{type:[String,Object],required:true},modelValue:null,label:{type:String,default:'Аргумент'}});
const emit=defineEmits(['update:modelValue']);
const spec=computed(()=>{
 const s=typeof props.schema==='string'?{type:props.schema}:props.schema;
 if(s.type!=='points')return s;
 const r=screenContract.valueRules.points;
 return {...s,type:'array',minItems:s.minItems??r.minItems,maxItems:s.maxItems??r.maxItems,items:{type:'tuple',items:['X','Y'].map(title=>({type:'int32_t',title,min:s.min??r.min,max:s.max??r.max}))}};
});
const sequence=computed(()=>Array.isArray(props.modelValue)?props.modelValue:defaultParameter(props.schema));
const tupleArray=computed(()=>spec.value.type==='array'&&spec.value.items?.type==='tuple');
const columns=computed(()=>'20px '+spec.value.items.items.map(s=>(typeof s==='object'?s.type:s)==='bool'?'32px':'minmax(44px,1fr)').join(' '));
function item(index,value){const next=[...sequence.value];next[index]=value;emit('update:modelValue',next);}
function cell(row,column,value){const next=[...sequence.value];next[row]=[...next[row]];next[row][column]=value;emit('update:modelValue',next);}
function number(event){if(event.target.validity.badInput||event.target.value==='')return;emit('update:modelValue',event.target.valueAsNumber);}
</script>
<template>
 <div v-if="tupleArray" class="native-array-table" :style="{'--native-columns':columns}">
  <div class="native-array-row native-array-head"><span>#</span><span v-for="(field,i) in spec.items.items" :key="i" :title="field.title??String(i+1)">{{field.title??i+1}}</span></div>
  <div v-for="(row,index) in sequence" :key="index" class="native-array-row"><span>{{index+1}}</span><ParameterInput v-for="(field,column) in spec.items.items" :key="column" :schema="field" :model-value="row[column]" :label="label+' / '+(index+1)+' / '+(column+1)" @update:model-value="cell(index,column,$event)"/></div>
  <div class="native-array-actions"><button class="action-button icon-action" :disabled="sequence.length>=spec.maxItems" :aria-label="label+' добавить элемент'" data-tooltip="Добавить элемент массива" @click="emit('update:modelValue',[...sequence,defaultParameter(spec.items)])"><Icon name="plus"/></button><button class="action-button icon-action" :disabled="sequence.length<=spec.minItems" :aria-label="label+' удалить элемент'" data-tooltip="Удалить последний элемент массива" @click="emit('update:modelValue',sequence.slice(0,-1))"><Icon name="trash"/></button></div>
 </div>
 <div v-else-if="spec.type==='object'" class="native-sequence"><div v-for="(field,key) in spec.fields" :key="key" class="native-argument"><span>{{field.title??key}}</span><ParameterInput :schema="field" :model-value="modelValue?.[key]??defaultParameter(field)" :label="label+' / '+key" @update:model-value="emit('update:modelValue',{...modelValue,[key]:$event})"/></div></div>
 <div v-else-if="spec.type==='tuple'||spec.type==='array'" class="native-sequence">
  <div v-for="(value,index) in sequence" :key="index" class="native-argument">
   <span>{{spec.type==='tuple'?(spec.items[index].title??index+1):index+1}}</span>
   <ParameterInput :schema="spec.type==='tuple'?spec.items[index]:spec.items" :model-value="value" :label="label+' / '+(index+1)" @update:model-value="item(index,$event)"/>
  </div>
  <div v-if="spec.type==='array'&&spec.minItems!==spec.maxItems" class="native-array-actions">
   <button class="action-button icon-action" :disabled="sequence.length>=spec.maxItems" :aria-label="label+' добавить элемент'" data-tooltip="Добавить элемент массива" @click="emit('update:modelValue',[...sequence,defaultParameter(spec.items)])"><Icon name="plus"/></button>
   <button class="action-button icon-action" :disabled="sequence.length<=spec.minItems" :aria-label="label+' удалить элемент'" data-tooltip="Удалить последний элемент массива" @click="emit('update:modelValue',sequence.slice(0,-1))"><Icon name="trash"/></button>
  </div>
 </div>
 <input v-else-if="spec.type==='bool'" type="checkbox" :aria-label="label" :checked="modelValue" @change="emit('update:modelValue',$event.target.checked)">
 <select v-else-if="spec.values" :aria-label="label" :value="modelValue" @change="emit('update:modelValue',Number($event.target.value))"><option v-for="(value,i) in spec.values" :key="value" :value="value">{{spec.labels?.[i]??value}}</option></select>
 <input v-else-if="['text','resource'].includes(spec.type)" :aria-label="label" :value="modelValue" @input="emit('update:modelValue',$event.target.value)">
 <input v-else type="number" :aria-label="label" :min="spec.min" :max="spec.max" :step="spec.type==='number'?'any':'1'" :value="modelValue" @input="number">
</template>
