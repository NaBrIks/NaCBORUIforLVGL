<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
import {dataDescriptor,dataSchemaAtPath,bindingLimits,bindingCatalogIsAuthoritative} from '@lvgl-cbor/screen-codec';
import Icon from '../../components/Icon.vue';
import {replaceSourcePathSegment} from './binding-model.js';
const props=defineProps({modelValue:{type:Object,required:true},capabilities:Object,writable:Boolean,label:{type:String,default:'Источник'}}),emit=defineEmits(['update:modelValue']);
const limits=computed(()=>bindingLimits(props.capabilities));
const sources=computed(()=>(props.capabilities?.binding?.sources??[]).filter(s=>!props.writable||s.writable)),offline=computed(()=>!bindingCatalogIsAuthoritative(props.capabilities));
const current=computed(()=>sources.value.find(s=>s.name===props.modelValue.source)),path=computed(()=>props.modelValue.path??[]);
const schemaAt=length=>{try{return dataDescriptor(dataSchemaAtPath(current.value?.schema,path.value.slice(0,length)));}catch{return undefined;}};
const tail=computed(()=>schemaAt(path.value.length)),rows=computed(()=>path.value.map((part,index)=>({part,index,schema:schemaAt(index)})));
function source(name){emit('update:modelValue',{source:name,path:[]});}
function segment(index,value){emit('update:modelValue',replaceSourcePathSegment(props.modelValue,index,value,current.value?.schema));}
function append(value){emit('update:modelValue',{source:props.modelValue.source,path:[...path.value,value]});}
</script>
<template><div class="binding-source-path">
 <select :aria-label="label" :value="modelValue.source" @change="source($event.target.value)"><option v-if="!current" :value="modelValue.source">{{modelValue.source||'Выберите источник…'}}</option><option v-for="entry in sources" :key="entry.name" :value="entry.name">{{entry.title?entry.title+' · '+entry.name:entry.name}}</option></select>
 <input v-if="offline&&!current" class="binding-source-name" :aria-label="label+' имя офлайн'" placeholder="Имя источника" :value="modelValue.source" @change="source($event.target.value)">
 <template v-for="row in rows" :key="row.index"><span class="binding-path-separator">/</span><select v-if="row.schema?.type==='object'" :aria-label="label+' поле '+(row.index+1)" :value="row.part" @change="segment(row.index,$event.target.value)"><option v-if="!Object.hasOwn(row.schema.fields,row.part)" :value="row.part">{{row.part}}</option><option v-for="(_,key) in row.schema.fields" :key="key" :value="key">{{key}}</option></select><input v-else-if="row.schema?.type==='array'||typeof row.part==='number'" class="binding-path-index" type="number" min="0" :max="(row.schema?.maxItems??limits.arrayItems)-1" :aria-label="label+' индекс '+(row.index+1)" :value="row.part" @change="Number.isSafeInteger($event.target.valueAsNumber)&&segment(row.index,$event.target.valueAsNumber)"><input v-else :aria-label="label+' поле '+(row.index+1)" :value="row.part" :readonly="!offline" @change="segment(row.index,$event.target.value)"></template>
 <select v-if="tail?.type==='object'&&path.length<limits.pathDepth" :aria-label="label+' добавить поле'" value="" @change="append($event.target.value)"><option value="" disabled>Поле…</option><option v-for="(_,key) in tail.fields" :key="key" :value="key">{{key}}</option></select>
 <button v-else-if="tail?.type==='array'&&path.length<limits.pathDepth" class="action-button" :aria-label="label+' элемент массива'" data-tooltip="Выбрать элемент массива по индексу" @click="append(0)">[индекс]</button>
 <template v-else-if="offline&&!tail&&path.length<limits.pathDepth"><button class="action-button" :aria-label="label+' добавить поле офлайн'" data-tooltip="Добавить символьное поле без каталога МК" @click="append('field')">+ поле</button><button class="action-button" :aria-label="label+' добавить индекс офлайн'" data-tooltip="Добавить индекс массива без каталога МК" @click="append(0)">+ [0]</button></template>
 <button v-if="path.length" class="action-button icon-action" :aria-label="label+' убрать последний путь'" data-tooltip="Убрать последний сегмент пути" @click="emit('update:modelValue',{source:modelValue.source,path:path.slice(0,-1)})"><Icon name="arrow-back-up"/></button><code v-if="tail" class="binding-source-type">{{tail.type}}</code>
</div></template>
