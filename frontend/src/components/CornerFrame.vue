<script setup>
import {computed,ref} from 'vue';
const props=defineProps({level:{type:Number,default:2},title:{type:String,default:''},showSide:{type:Boolean,default:true},showHeader:{type:Boolean,default:true},collapsible:{type:Boolean,default:true}});
const collapsed=ref(false);
const isCollapsed=computed(()=>props.collapsible&&props.showHeader&&collapsed.value);
</script>
<template>
 <div class="corner-frame" :class="['corner-level-'+level,{'corner-collapsed':isCollapsed,'corner-no-side':!showSide,'corner-no-header':!showHeader}]">
  <div v-if="showHeader&&showSide" class="corner-joint"><button v-if="collapsible" class="corner-toggle" type="button" :aria-expanded="!isCollapsed" :aria-label="isCollapsed?'Развернуть раздел':'Свернуть раздел'" :data-tooltip="isCollapsed?'Развернуть раздел':'Свернуть раздел'" @click="collapsed=!collapsed">{{isCollapsed?'▸':'▾'}}</button></div>
  <div v-if="showHeader" class="corner-cap"><span v-if="isCollapsed&&level!==1" class="corner-collapsed-name">{{title||$attrs['aria-label']||'Блок'}}</span><slot v-else name="header">{{title}}</slot></div>
  <div v-if="showSide" v-show="!isCollapsed" class="corner-side"><slot name="side"></slot></div>
  <div v-show="!isCollapsed" class="corner-data"><slot></slot></div>
 </div>
</template>
