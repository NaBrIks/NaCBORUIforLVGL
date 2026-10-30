<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import EditorTransfers from './EditorTransfers.vue';
import {computed,ref} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {styleFields,styleGroups} from '../generated/style-fields';
import {byName,expandProps} from '../style-model';
import StyleSection from './StyleSection.vue';
import ObservedStyle from './ObservedStyle.vue';
import {editorSections} from '../editor-schema';


const props=defineProps({modelValue:{type:Object,required:true},observed:{type:Object,default:null},resources:{type:Array,default:()=>[]},autoApply:Boolean,canApply:Boolean,projectMode:Boolean});
const emit=defineEmits(['update:modelValue','apply','editing']);
const query=ref(''),group=ref('all'),onlyActive=ref(false),shortcut=ref('pad_all'),shortcutValue=ref(18);

const values=computed(()=>props.modelValue.props??{}),activeCount=computed(()=>Object.keys(values.value).length);
const shortcuts=contract.methods.filter(m=>m.properties.length>1);
const selectedShortcut=computed(()=>byName.get(shortcut.value));

function change(field,value){emit('update:modelValue',{...props.modelValue,[field]:value});}
function merge(event){change('merge',event.target.value.split(',').map(x=>x.trim()).filter(Boolean));}
function applyShortcut(){const m=selectedShortcut.value,raw=m.parameters.length>1?[shortcutValue.value,shortcutValue.value]:shortcutValue.value;change('props',expandProps({...values.value,[m.alias]:raw}));}
</script>
<template>
 <section class="panel style-editor visual-editor">
  <div class="panel-head"><h2>Именованный стиль</h2><span>{{activeCount}} / {{styleFields.length}} свойств</span></div>
  <EditorTransfers kind="style" :document="modelValue" @import="emit('update:modelValue',{...$event,props:expandProps($event.props??{})})"/>
  <div class="style-identity"><label v-if="!projectMode">Область<select aria-label="Область стиля" :value="modelValue.scope" @change="change('scope',$event.target.value)"><option value="screen">Экран</option><option value="global">Глобальная</option></select></label><label>Имя<input aria-label="Имя стиля" :value="modelValue.name" @change="change('name',$event.target.value)"></label><label>Основа (copy)<input aria-label="Основа стиля" :value="modelValue.copy??''" placeholder="global:base" @change="change('copy',$event.target.value||null)"></label><label v-if="!projectMode" class="attach-check"><input type="checkbox" :checked="modelValue.attach!==false" @change="change('attach',$event.target.checked)">На экран</label></div>
  <ObservedStyle v-if="observed" :values="observed"/>
  <div class="properties-toolbar"><input type="search" aria-label="Поиск свойства" v-model="query" placeholder="Свойство / название / тип…"><select aria-label="Группа свойств" v-model="group"><option value="all">Все группы · {{styleFields.length}} свойств</option><option v-for="g in styleGroups" :key="g.id" :value="g.id">{{g.name}}</option></select><label><input type="checkbox" v-model="onlyActive">Только заданные</label></div>
  <div class="property-groups"><StyleSection v-for="section in editorSections" :key="section.id" :section="section.id" :model-value="values" :resources="resources" :query="query" :group="group" :only-active="onlyActive" @update:model-value="change('props',$event)"/></div>
  <details class="style-composition"><summary>Композиция и составные методы</summary><label>Merge, по порядку<input aria-label="Источники merge" :value="(modelValue.merge??[]).join(', ')" placeholder="global:colors, global:compact" @change="merge"></label><div class="shortcut-controls"><select aria-label="Составной метод" v-model="shortcut"><option v-for="method in shortcuts" :key="method.index" :value="method.alias">{{method.alias}}</option></select><input type="number" aria-label="Значение составного метода" v-model.number="shortcutValue"><button @click="applyShortcut">Задать</button></div><p>Составные методы разворачиваются в отдельные свойства; пересекающихся setter-ов в пакете нет.</p></details>
  <details class="style-source"><summary>JSON описания — дополнительные сведения</summary><pre>{{JSON.stringify(modelValue,null,2)}}</pre></details>
 </section>
</template>
