<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import CornerFrame from './CornerFrame.vue';
import {describeField,describeGroup} from '../style-help';
import {byName,kind} from '../style-model';
import OptionalStyleValue from './OptionalStyleValue.vue';
defineProps({group:Object,values:Object,resources:Array});
const emit=defineEmits(['set']);
const help=describeField;
</script>
<template>
 <CornerFrame class="property-grid" role="group" :aria-label="group.name"><template #side><span :data-tooltip="describeGroup(group)">{{group.name}}</span></template>
  <div class="property-grid-rows"><div v-for="field in group.fields" :key="field.name" class="property-grid-row">
   <span class="property-grid-name" tabindex="0" :data-tooltip="help(field)">{{field.name}}</span>
   <div class="property-grid-value"><OptionalStyleValue :method="byName.get(field.name)" :model-value="values[field.name]" :resources="resources" @update:model-value="emit('set',field.name,$event)"/></div>
   <button v-if="kind(byName.get(field.name))==='resource'" class="property-grid-clear" :disabled="!Object.hasOwn(values,field.name)" :aria-label="'Убрать '+field.name" data-tooltip="Не задавать свойство" @click="emit('set',field.name,undefined)">×</button>
  </div></div>
 </CornerFrame>
</template>
