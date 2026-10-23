<script setup>
import ClearableSelect from './ClearableSelect.vue';
import ColorInput from './ColorInput.vue';
import {computed} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import {kind,limits,fonts} from '../style-model';
import {commitNumberInput,commitColorInput,colorText,toggleFlags} from '../field-input';
import NumberInput from './NumberInput.vue';
import LayoutValue from './LayoutValue.vue';
const props=defineProps({method:{type:Object,required:true},modelValue:{default:undefined},resources:{type:Array,default:()=>[]},nullable:Boolean});
const {capabilities,catalog}=useRuntimeCapabilities();
const emit=defineEmits(['update:modelValue']);
const commit=value=>emit('update:modelValue',value);
const mode=computed(()=>props.method.alias==='layout'?'layout':kind(props.method));
const type=computed(()=>props.method.parameters[0]);
const range=computed(()=>{const base=limits(type.value),rule=catalog.value.valueRules.properties[props.method.properties[0]];return [rule?.min??base[0],rule?.max??base[1]];});
const entries=computed(()=>Object.entries(catalog.value.enums[type.value]??{}));
const flags=computed(()=>[...new Map(entries.value.map(([name,value])=>[value,{name,value}])).values()]);
const options=computed(()=>mode.value==='font'?(capabilities?.value?props.resources.filter(r=>r.type===type.value).map(r=>({label:r.name,value:r.name})):fonts.map(f=>({label:f.label,value:f.name}))):mode.value==='boolean'?[{label:'Нет',value:false},{label:'Да',value:true}]:(props.nullable?entries.value:flags.value.map(e=>[e.name,e.value])).map(([label,value])=>({label:label.replace(/^LV_/,''),value})));
const selectWidth=computed(()=>Math.min(34,Math.max(12,...options.value.map(o=>o.label.length),String(props.modelValue??'').length))+'ch');
const selected=computed(()=>props.modelValue===undefined?'':String(props.modelValue));
const color=computed(()=>colorText(props.modelValue,props.nullable?'':'#ffffff'));
const resourceNames=computed(()=>props.resources.filter(r=>r.type===type.value).map(r=>r.name));
function number(event){commitNumberInput(event,value=>{if(props.nullable||value!==undefined)commit(value);});}
function choose(event){commit(options.value.find(o=>String(o.value)===event.target.value)?.value);}
function hex(event){commitColorInput(event,commit);}
</script>
<template>
 <ColorInput v-if="mode==='color'" :class="nullable?'optional-color':'color-input'" :name="method.alias" :model-value="modelValue" :nullable="nullable" @update:model-value="commit"/>
 <LayoutValue v-else-if="mode==='layout'" :model-value="modelValue" @update:model-value="commit"/>
 <label v-else-if="mode==='boolean'&&!nullable" class="boolean-value"><input type="checkbox" :aria-label="method.alias" :checked="modelValue===true" @change="commit($event.target.checked)">{{modelValue?'Да':'Нет'}}</label>
 <ClearableSelect v-else-if="['enum','font','boolean'].includes(mode)" :class="{'style-select':!nullable}" :style="nullable?undefined:{width:selectWidth}" :aria-label="method.alias" :value="selected" @change="choose"><option v-if="nullable" value="">—</option><option v-for="option in options" :key="String(option.value)" :value="String(option.value)">{{option.label}}</option><option v-if="modelValue!==undefined&&!options.some(o=>o.value===modelValue)" :value="String(modelValue)">{{modelValue}}</option></ClearableSelect>
 <details v-else-if="mode==='flags'" class="flag-picker"><summary :aria-label="method.alias" :data-tooltip="flags.filter(e=>e.value===0?!modelValue:!!(Number(modelValue)&e.value)).map(e=>e.name).join(' | ')">{{modelValue===undefined?'—':Number(modelValue)||0}}</summary><button v-if="modelValue!==undefined" type="button" class="field-clear" :aria-label="'Очистить '+method.alias" data-tooltip="Не задавать значение" @mousedown.prevent @click.stop="commit(undefined)">×</button><span class="flag-input"><label v-for="entry in flags.filter(e=>e.value===0||(e.value&(e.value-1))===0)" :key="entry.value"><input type="checkbox" :aria-label="method.alias+' '+entry.name" :checked="modelValue!==undefined&&(entry.value===0?!modelValue:!!(Number(modelValue)&entry.value))" @change="commit(toggleFlags(modelValue,entry.value,$event.target.checked))">{{entry.name.replace(/^LV_(BORDER_SIDE_|TEXT_DECOR_)/,'')}}</label></span></details>
 <template v-else-if="mode==='resource'">
  <input v-if="nullable" :aria-label="method.alias" :value="modelValue??''" :data-tooltip="'Имя зарегистрированного ресурса МК · '+type" @change="commit($event.target.value.trim()||undefined)">
  <span v-else class="resource-input" :data-tooltip="resourceNames.length?'Ресурс МК: '+resourceNames.join(', '):'Нужен зарегистрированный ресурс МК ('+type+')'"><input :aria-label="method.alias" :list="method.alias+'-resources'" :value="modelValue" placeholder="Имя ресурса МК" @change="commit($event.target.value)"><datalist :id="method.alias+'-resources'"><option v-for="name in resourceNames" :key="name" :value="name"/></datalist></span>
 </template>
 <NumberInput v-else-if="nullable" class="style-number" step="1" :min="range[0]" :max="range[1]" :aria-label="method.alias" :value="modelValue??''" @input="number"/>
 <input v-else class="style-number" :class="{'style-number-short':type==='lv_opa_t'||type==='uint8_t'}" type="number" step="1" :min="range[0]" :max="range[1]" :aria-label="method.alias" :value="modelValue" @input="number">
</template>
