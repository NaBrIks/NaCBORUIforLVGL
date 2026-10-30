<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {ref,computed,onMounted,onBeforeUnmount,inject,provide,watch} from 'vue';
import PreviewNode from './PreviewNode.vue';
import {createCompositionPreview} from '../modules/composition/preview-composition.js';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
const props=defineProps({width:{type:Number,default:800},height:{type:Number,default:480},screen:{type:Object,required:true},screens:Object,focusPath:{type:Array,default:()=>[]},grid:{type:Number,default:0},zoom:{type:Number,default:0},padding:{type:Number,default:16},showScale:{type:Boolean,default:true},selected:String,showHidden:Boolean,interactive:Boolean,contained:Boolean,mountSizing:{type:String,default:'fill'}});
const emit=defineEmits(['select','scale']);
const project=inject('lvgl-project',null),{capabilities}=useRuntimeCapabilities(),composition=ref(null),selection=ref(null);
const focused=computed(()=>{let instance=composition.value?.root;for(const view of props.focusPath)instance=instance?.views[view]?.child;return instance??composition.value?.root;});
watch([()=>props.screen,()=>props.screens,()=>props.focusPath,()=>project?.workspace.project.value],()=>{composition.value=createCompositionPreview(props.screen,props.screens??project?.workspace.project.value.screens,capabilities?.value);selection.value={instance:focused.value.id,node:props.selected};},{deep:true,immediate:true});
watch(()=>props.selected,node=>{selection.value={instance:focused.value.id,node};});
const context={composition,selection,interactive:computed(()=>props.interactive),select(instance,node){selection.value={instance:instance.id,node};if(instance.id===focused.value.id)emit('select',node);},navigate(instance,target){composition.value.navigate(instance.id,target);}};
provide('lvgl-composition-preview',context);
const viewport=ref(null),available=ref({width:1,height:1});let observer;
const scale=computed(()=>props.zoom>0?props.zoom/100:Math.max(.01,Math.min((available.value.width-2*props.padding)/props.width,(available.value.height-2*props.padding)/props.height)));
onMounted(()=>{observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;available.value={width,height};});observer.observe(viewport.value);});
onBeforeUnmount(()=>observer?.disconnect());
defineExpose({scale});
</script>
<template><div ref="viewport" class="virtual-viewport" :style="{'--virtual-padding':padding+'px'}" role="region" aria-label="Виртуальный экран"><div class="virtual-scroll"><div class="virtual-footprint" :style="{width:width*scale+'px',height:height*scale+'px'}"><div class="virtual-screen" :style="{width:width+'px',height:height+'px',transform:`scale(${scale})`}" :data-scale="scale"><PreviewNode :node="screen.root" :screen="screen" :instance="composition.root" :show-hidden="showHidden" root :mounted="contained" :mount-sizing="mountSizing" :selected="selected" @select="emit('select',$event)"/><div v-if="grid>0" class="virtual-grid" :style="{backgroundSize:`${grid}px ${grid}px`}"></div></div></div></div><output v-if="showScale" class="virtual-scale"><span v-if="selection?.instance!==composition.root.id">#{{selection.instance}} · {{selection.node}} · </span>{{width}} × {{height}} · {{Math.round(scale*100)}} %</output></div></template>
