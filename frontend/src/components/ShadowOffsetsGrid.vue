<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import CornerFrame from './CornerFrame.vue';
import {computed} from 'vue';
import {describeField} from '../style-help';
import {byName} from '../style-model';
import OptionalStyleValue from './OptionalStyleValue.vue';
const props=defineProps({groups:Array,values:Object,resources:Array});
const emit=defineEmits(['set']);
const fields=computed(()=>props.groups.flatMap(g=>g.fields));
const field=name=>fields.value.find(f=>f.name===name);
const rows=computed(()=>['shadow','drop_shadow'].filter(prefix=>['x','y'].some(axis=>field(prefix+'_offset_'+axis))));
</script>
<template>
 <CornerFrame v-if="rows.length" class="shadow-offsets" :level="3" role="group" aria-label="Смещения тени X/Y"><template #side><span>offset</span></template>
  <template #header><div class="shadow-offsets-head"><span></span><span>X</span><span>Y</span></div></template>
  <div v-for="prefix in rows" :key="prefix" class="shadow-offsets-row"><span class="edge-matrix-name">{{prefix}}</span><div v-for="axis in ['x','y']" :key="axis" class="edge-matrix-cell"><template v-if="field(prefix+'_offset_'+axis)"><div class="edge-matrix-editor" :data-tooltip="describeField(field(prefix+'_offset_'+axis))"><OptionalStyleValue :method="byName.get(prefix+'_offset_'+axis)" :model-value="values[prefix+'_offset_'+axis]" :resources="resources" @update:model-value="emit('set',prefix+'_offset_'+axis,$event)"/></div></template></div></div>
 </CornerFrame>
</template>
