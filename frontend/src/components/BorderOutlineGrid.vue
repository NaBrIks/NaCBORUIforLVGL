<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import CornerFrame from './CornerFrame.vue';
import {describeField,describeGroup} from '../style-help';
import {computed} from 'vue';
import {byName,kind} from '../style-model';
import OptionalStyleValue from './OptionalStyleValue.vue';
import PropertyGrid from './PropertyGrid.vue';
import ShadowOffsetsGrid from './ShadowOffsetsGrid.vue';
const props=defineProps({groups:Array,values:Object,resources:Array});
const emit=defineEmits(['set']);
const columns=[{key:'width',label:'width'},{key:'color',label:'color'},{key:'opa',label:'opa'}];
const field=(group,key)=>group.fields.find(f=>f.name===group.id+'_'+key);
const rows=computed(()=>{
 const groups=props.groups.map(g=>g.id==='shadow'?{...g,fields:g.fields.filter(f=>!f.name.startsWith('drop_shadow_'))}:g);
 const fields=props.groups.flatMap(g=>g.fields).filter(f=>f.name.startsWith('drop_shadow_'));
 if(fields.length)groups.push({id:'drop_shadow',name:'drop_shadow',fields});
 return groups;
});
const extras=computed(()=>rows.value.map(g=>({...g,name:g.id,fields:g.fields.filter(f=>!columns.some(c=>f.name===g.id+'_'+c.key)&&!/^((drop_)?shadow)_offset_[xy]$/.test(f.name))})).filter(g=>g.fields.length));
const help=describeField;
</script>
<template>
 <CornerFrame class="edge-matrix" role="group" aria-label="Контуры и тень" title="Контуры и тень">
  <template #header><div class="edge-matrix-title">Контуры и тень</div><div class="edge-matrix-head"><span></span><span v-for="column in columns" :key="column.key" :data-tooltip="column.key==='opa'?'LVGL opa: 0 — прозрачно, 255 — непрозрачно':column.label">{{column.label}}</span></div></template>
  <div v-for="g in rows.filter(item=>columns.some(c=>field(item,c.key)))" :key="g.id" class="edge-matrix-row">
   <span class="edge-matrix-name" tabindex="0" :data-tooltip="describeGroup(g)">{{g.id}}</span>
   <div v-for="column in columns" :key="column.key" class="edge-matrix-cell">
    <template v-if="field(g,column.key)"><div class="edge-matrix-editor" :data-tooltip="help(field(g,column.key))"><OptionalStyleValue :method="byName.get(field(g,column.key).name)" :model-value="values[field(g,column.key).name]" :resources="resources" @update:model-value="emit('set',field(g,column.key).name,$event)"/></div><button v-if="kind(byName.get(field(g,column.key).name))==='resource'" class="property-grid-clear" :disabled="!Object.hasOwn(values,field(g,column.key).name)" :aria-label="'Убрать '+field(g,column.key).name" data-tooltip="Не задавать свойство" @click="emit('set',field(g,column.key).name,undefined)">×</button></template>
   </div>
  </div>
  <ShadowOffsetsGrid :groups="groups" :values="values" :resources="resources" @set="(name,value)=>emit('set',name,value)"/>
  <PropertyGrid :show-side="false" :show-header="false" :collapsible="false" :level="3" class="edge-extra" v-for="g in extras" :key="g.id" :group="g" :values="values" :resources="resources" @set="(name,value)=>emit('set',name,value)"/>
 </CornerFrame>
</template>