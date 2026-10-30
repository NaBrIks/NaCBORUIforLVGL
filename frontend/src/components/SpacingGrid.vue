<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {commitNumberInput} from '../field-input';
import NumberInput from './NumberInput.vue';
import CornerFrame from './CornerFrame.vue';
import {describeField} from '../style-help';
import {computed} from 'vue';
import {limits} from '../style-model';
const props=defineProps({groups:Array,values:Object});
const emit=defineEmits(['set']);
const range=limits('int32_t');
const fields=computed(()=>props.groups.flatMap(g=>g.fields));
const field=name=>fields.value.find(f=>f.name===name);
const sides=['top','right','bottom','left'];
const rows=computed(()=>[['padding','pad'],['margin','margin']].filter(([,prefix])=>sides.some(side=>field(prefix+'_'+side))));
const gaps=computed(()=>['row','column','radial'].filter(name=>field('pad_'+name)));
const help=name=>describeField(field(name));
function update(name,event){commitNumberInput(event,value=>emit('set',name,value));}
</script>
<template>
 <CornerFrame class="spacing-grid" role="group" aria-label="Внутренние и внешние отступы">
  <template #header><div class="spacing-header"><span></span><span v-for="side in sides" :key="side">{{side}}</span></div></template>
  <template #side><span>Отступы</span></template>
  <div>
   <div v-for="[label,prefix] in rows" :key="prefix" class="spacing-row"><span class="geometry-grid-name" tabindex="0" :data-tooltip="prefix==='pad'?'Внутренние отступы':'Внешние отступы'">{{label}}</span><div v-for="side in sides" :key="side" class="geometry-grid-value"><NumberInput v-if="field(prefix+'_'+side)" class="style-number" type="number" step="1" :min="range[0]" :max="range[1]" :aria-label="prefix+'_'+side" :data-tooltip="help(prefix+'_'+side)" :value="values[prefix+'_'+side]??''" @input="update(prefix+'_'+side,$event)"/></div></div>
   <CornerFrame v-if="gaps.length" class="gap-grid" :level="3" role="group" aria-label="Межэлементные отступы">
    <template #header><div class="gap-header"><span v-for="name in ['row','column','radial']" :key="name">{{name}}</span></div></template>
    <template #side><span tabindex="0" data-tooltip="Внутренние отступы между строками, колонками и по радиусу">gap</span></template>
    <div class="gap-values"><div v-for="name in ['row','column','radial']" :key="name" class="geometry-grid-value"><NumberInput v-if="field('pad_'+name)" class="style-number" type="number" step="1" :min="range[0]" :max="range[1]" :aria-label="'pad_'+name" :data-tooltip="help('pad_'+name)" :value="values['pad_'+name]??''" @input="update('pad_'+name,$event)"/></div></div>
   </CornerFrame>
  </div>
 </CornerFrame>
</template>