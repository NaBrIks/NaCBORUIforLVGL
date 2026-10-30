<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
import {editorGroups} from '../editor-schema';
import {updateProperty} from '../style-model';
import GeometryGrid from './GeometryGrid.vue';
import SpacingGrid from './SpacingGrid.vue';
import BackgroundGrid from './BackgroundGrid.vue';
import BorderOutlineGrid from './BorderOutlineGrid.vue';
import PropertyGrid from './PropertyGrid.vue';
const props=defineProps({group:{type:String,required:true},modelValue:{type:Object,required:true},resources:{type:Array,default:()=>[]},groups:{type:Array,default:()=>editorGroups},showSide:{type:Boolean,default:true},collapsible:{type:Boolean,default:true},showHeader:{type:Boolean,default:true}});
const emit=defineEmits(['update:modelValue','set']);
const entry=computed(()=>props.groups.find(g=>g.id===props.group));
const panel=computed(()=>['size','position','transform'].includes(props.group)?GeometryGrid:['padding','margin'].includes(props.group)?SpacingGrid:props.group==='background'?BackgroundGrid:['border','outline','shadow'].includes(props.group)?BorderOutlineGrid:PropertyGrid);
const panelGroups=computed(()=>props.groups.filter(g=>['padding','margin'].includes(props.group)?['padding','margin'].includes(g.id):['border','outline','shadow'].includes(g.id)));
function set(name,value){emit('update:modelValue',updateProperty(props.modelValue,name,value));emit('set',name,value);}
</script>
<template>
 <component class="style-controls" v-if="entry" :is="panel" :group="entry" :groups="panelGroups" :values="modelValue" :resources="resources" :show-side="showSide" :collapsible="collapsible" :show-header="showHeader" @set="set"/>
</template>
