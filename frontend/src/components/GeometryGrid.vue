<script setup>
import ClearableSelect from './ClearableSelect.vue';
import {commitNumberInput} from '../field-input';
import NumberInput from './NumberInput.vue';
import CornerFrame from './CornerFrame.vue';
import {describeField} from '../style-help';
import {computed} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {limits} from '../style-model';
const props=defineProps({group:{type:Object,required:true},values:{type:Object,required:true}});
const emit=defineEmits(['set']);
const range=limits('int32_t');
const layouts={
 size:[['size','width','height'],['min','min_width','min_height'],['max','max_width','max_height'],['length','length']],
 position:[['pos','x','y'],['align','align'],['radial','radial_offset']],
 transform:[['size','transform_width','transform_height'],['move','translate_x','translate_y'],['scale','transform_scale_x','transform_scale_y'],['pivot','transform_pivot_x','transform_pivot_y'],['skew','transform_skew_x','transform_skew_y'],['rotate','transform_rotation'],['radial','translate_radial']]
};
const field=name=>props.group.fields.find(f=>f.name===name);
const rows=computed(()=>layouts[props.group.id].filter(row=>row.slice(1).some(field)));
const help=name=>describeField(field(name));
const alignments=Object.entries(contract.enums.lv_align_t??{});
function update(name,event){commitNumberInput(event,value=>emit('set',name,value));}
</script>
<template>
 <CornerFrame class="geometry-grid" role="group" :aria-label="group.name"><template #header><div class="geometry-grid-header"><span></span><span v-if="group.id==='size'" tabindex="0" data-tooltip="Ось X / ширина W">X/W</span><span v-else>X</span><span v-if="group.id==='size'" tabindex="0" data-tooltip="Ось Y / высота H">Y/H</span><span v-else>Y</span></div></template><template #side><span>{{group.name}}</span></template>
   <div class="geometry-grid-rows">
    <div v-for="row in rows" :key="row[0]" class="geometry-grid-row">
     <span class="geometry-grid-name" tabindex="0" :data-tooltip="row.slice(1).filter(field).map(help).join('\n\n')">{{row[0]}}</span>
     <div v-for="column in (row[1]==='align'?[1]:[1,2])" :key="column" class="geometry-grid-value" :class="{'geometry-grid-wide':row[1]==='align'}">
      <template v-if="row[column]&&field(row[column])">
       <ClearableSelect v-if="row[column]==='align'" aria-label="align" :data-tooltip="help('align')" :value="values.align??''" @change="emit('set','align',$event.target.value===''?undefined:Number($event.target.value))"><option value="">—</option><option v-for="[name,value] in alignments" :key="name" :value="value">{{name.replace(/^LV_/,'')}}</option></ClearableSelect>
       <NumberInput v-else class="style-number" type="number" step="1" :min="range[0]" :max="range[1]" :aria-label="row[column]" :data-tooltip="help(row[column])" :value="values[row[column]]??''" @input="update(row[column],$event)"/>
      </template>
     </div>
    </div>
   </div>
 </CornerFrame>
</template>
