<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import ClearableSelect from './ClearableSelect.vue';
import ColorInput from './ColorInput.vue';
import {commitNumberInput,commitColorInput,colorText} from '../field-input';
import NumberInput from './NumberInput.vue';
import CornerFrame from './CornerFrame.vue';
import {describeField} from '../style-help';
import {computed} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {limits} from '../style-model';
const props=defineProps({group:Object,values:Object});
const emit=defineEmits(['set']);
const layout=[['color','bg_color','bg_grad_color'],['opa','bg_main_opa','bg_grad_opa'],['stop','bg_main_stop','bg_grad_stop'],['bg opa','bg_opa'],['dir','bg_grad_dir'],['resource','bg_grad']];
const field=name=>props.group.fields.find(f=>f.name===name);
const rows=computed(()=>layout.filter(row=>row.slice(1).some(field)));
const help=name=>describeField(field(name));
const color=name=>colorText(props.values[name]);
const directions=Object.entries(contract.enums.lv_grad_dir_t??{});
function number(name,event){commitNumberInput(event,value=>emit('set',name,value));}
function hex(name,event){commitColorInput(event,value=>emit('set',name,value));}
</script>
<template>
 <CornerFrame class="background-grid" role="group" aria-label="Фон"><template #side><span>Фон</span></template>
  <template #header><div class="background-header"><span></span><span tabindex="0" data-tooltip="Основной цвет фона">main</span><span tabindex="0" data-tooltip="Второй цвет градиента">grad</span></div></template><div>
   <div v-for="row in rows" :key="row[0]" class="background-row"><span class="geometry-grid-name" tabindex="0" :data-tooltip="row.slice(1).filter(field).map(help).join('\n\n')">{{row[0]}}</span>
    <div v-for="column in (['bg_grad_dir','bg_grad'].includes(row[1])?[1]:[1,2])" :key="column" class="background-value" :class="{'background-wide':['bg_grad_dir','bg_grad'].includes(row[1])}">
     <template v-if="row[column]&&field(row[column])">
      <ColorInput v-if="field(row[column]).type==='lv_color_t'" class="background-color" :name="row[column]" :model-value="values[row[column]]" @update:model-value="emit('set',row[column],$event)"/>
      <ClearableSelect v-else-if="row[column]==='bg_grad_dir'" aria-label="bg_grad_dir" :value="values.bg_grad_dir??''" @change="emit('set','bg_grad_dir',$event.target.value===''?undefined:Number($event.target.value))"><option value="">—</option><option v-for="[name,value] in directions" :key="name" :value="value">{{name.replace(/^LV_GRAD_DIR_/,'')}}</option></ClearableSelect>
      <input v-else-if="row[column]==='bg_grad'" aria-label="bg_grad" :data-tooltip="help('bg_grad')+'\nИмя зарегистрированного ресурса МК'" :value="values.bg_grad??''" @change="emit('set','bg_grad',$event.target.value.trim()||undefined)">
      <NumberInput v-else class="style-number" type="number" step="1" :min="limits(field(row[column]).type)[0]" :max="limits(field(row[column]).type)[1]" :aria-label="row[column]" :data-tooltip="help(row[column])" :value="values[row[column]]??''" @input="number(row[column],$event)"/>
     </template>
    </div>
   </div>
  </div>
 </CornerFrame>
</template>
