<script setup>
import {computed} from 'vue';
import {editorSections,editorGroups,filterEditorGroups,combinedGroupIds} from '../editor-schema';
import CornerFrame from './CornerFrame.vue';
import StyleGroup from './StyleGroup.vue';
const props=defineProps({section:{type:String,default:'geometry'},modelValue:{type:Object,required:true},resources:{type:Array,default:()=>[]},query:{type:String,default:''},onlyActive:Boolean,group:{type:String,default:'all'},excludeGroups:{type:Array,default:()=>[]},excludeFields:{type:Array,default:()=>[]},showSide:{type:Boolean,default:true},collapsible:{type:Boolean,default:true},showHeader:{type:Boolean,default:true},groupShowSide:{type:Boolean,default:true},groupCollapsible:{type:Boolean,default:true},extraContent:Boolean});
const emit=defineEmits(['update:modelValue']);
const category=computed(()=>editorSections.find(s=>s.id===props.section));
const groups=computed(()=>filterEditorGroups(editorGroups.filter(g=>category.value?.ids.includes(g.id)&&!props.excludeGroups.includes(g.id)).map(g=>({...g,fields:g.fields.filter(f=>!props.excludeFields.includes(f.name))})),props.modelValue,props));
const ids=computed(()=>combinedGroupIds(groups.value));
</script>
<template>
 <CornerFrame v-if="category&&(ids.length||extraContent)" class="property-category style-controls" :level="1" :title="category.name" :show-side="showSide" :show-header="showHeader" :collapsible="collapsible"><template #header><h3 tabindex="0" :data-tooltip="category.name" :data-tooltip-section="category.name">{{category.name}}</h3></template><slot name="before-groups"/><div v-for="id in ids" :key="id" class="geometry-group">
  <StyleGroup :group="id" :model-value="modelValue" :resources="resources" :groups="groups" :show-side="groupShowSide" :collapsible="groupCollapsible" @update:model-value="emit('update:modelValue',$event)"/>
 </div></CornerFrame>
</template>

