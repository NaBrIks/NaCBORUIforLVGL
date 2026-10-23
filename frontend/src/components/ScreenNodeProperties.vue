<script setup>
import {computed,ref} from 'vue';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import {contract} from '@lvgl-cbor/style-codec';
import {screenContract} from '@lvgl-cbor/screen-codec';
import {clone,parseTracks,formatTracks,effectiveProps,effectiveFlags} from '../screen-model';
import {editorSections} from '../editor-schema';
import CornerFrame from './CornerFrame.vue';
import StyleSection from './StyleSection.vue';
import ScreenDimensionValue from './ScreenDimensionValue.vue';
import NumberInput from './NumberInput.vue';
import ClearableSelect from './ClearableSelect.vue';
import NativeProperties from '../modules/native-widgets/NativeProperties.vue';
import ProjectStyleUses from './ProjectStyleUses.vue';
import BindingEditor from '../modules/bindings/BindingEditor.vue';
import ViewEditor from '../modules/composition/ViewEditor.vue';
const {catalog,layouts,families,capabilities}=useRuntimeCapabilities();
const props=defineProps({modelValue:{type:Object,required:true},screen:Object,parent:Object,resources:{type:Array,default:()=>[]},screenStyles:{type:Array,default:()=>[]}});
const emit=defineEmits(['update:modelValue','invalid']);
const query=ref('');
const node=computed(()=>props.modelValue);
const nodeProps=computed(()=>effectiveProps(node.value)),nodeFlags=computed(()=>effectiveFlags(node.value));
const scalarStyle=computed(()=>Object.fromEntries(Object.entries(node.value.style??{}).filter(([,v])=>v===null||typeof v!=='object')));
const rangeType=computed(()=>['bar','slider','arc'].includes(node.value.type));
const nativeFamily=computed(()=>families.value.find(w=>w.abi&&w.name===node.value.type));
const componentFamily=computed(()=>families.value.find(w=>w.name===node.value.type));
const hasContent=computed(()=>node.value.type!=='obj'&&!nativeFamily.value);
const flows=computed(()=>Object.keys(catalog.value.enums.lv_flex_flow_t));
const flags={HIDDEN:'Скрыть компонент вместе с дочерними объектами.',IGNORE_LAYOUT:'Исключить из Flex/Grid родителя; положение задаётся вручную.',OVERFLOW_VISIBLE:'Показывать дочерние объекты за границей компонента.',SCROLLABLE:'Разрешить прокрутку содержимого компонента.'};
function edit(fn){const next=clone(node.value);fn(next);emit('update:modelValue',next);}
function updateStyle(values){edit(n=>{const special=Object.fromEntries(Object.entries(n.style??{}).filter(([,v])=>v&&typeof v==='object'));n.style={...values,...special};});}
function setStyle(key,value){edit(n=>{n.style??={};if(value===undefined||value==='')delete n.style[key];else n.style[key]=value;});}
function setProp(key,value){edit(n=>{if(key==='checked')for(const op of ['add_state','remove_state'])if(n.common?.[op]!==undefined){n.common[op]&=~screenContract.states.CHECKED;if(!n.common[op])delete n.common[op];}n.props??={};if(value===undefined)delete n.props[key];else n.props[key]=value;});}
function setFlag(key,value){edit(n=>{for(const op of ['add_flags','remove_flags'])if(n.common?.[op]!==undefined){n.common[op]&=~screenContract.flags[key];if(!n.common[op])delete n.common[op];}n.flags??={};n.flags[key]=value;});}
function number(key,event,style=false){if(event.target.validity.badInput)return;const value=event.target.value===''?undefined:event.target.valueAsNumber;if(value!==undefined&&!Number.isFinite(value))return;(style?setStyle:setProp)(key,value);}
function tracks(key,event){try{const value=parseTracks(event.target.value);setStyle(key,value.length?value:undefined);}catch(e){emit('invalid',e.message);}}
function points(event){try{const value=JSON.parse(event.target.value);if(!Array.isArray(value)||value.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error();setProp('points',value);}catch{emit('invalid','Точки: [[0,0],[100,50]]');}}
</script>
<template>
 <div class="screen-node-properties style-controls">
  <CornerFrame class="property-category" :class="{'native-component-category':!!nativeFamily}" :level="1" title="Компонент"><template #header><h3 data-tooltip="Содержимое выбранного виджета и общие флаги объекта LVGL. Геометрия и оформление находятся в следующих разделах.">Компонент</h3></template>
   <NativeProperties v-if="nativeFamily" :key="node.id" :family="nativeFamily" :values="node.props??{}" @set="setProp"/>
   <div v-if="hasContent" class="geometry-group"><CornerFrame class="property-grid" title="Содержимое" role="group" aria-label="Содержимое компонента"><template #side><span>{{node.type}}</span></template>
    <div class="property-grid-rows">
     <div v-if="['label','button','checkbox','textarea'].includes(node.type)" class="property-grid-row"><label class="property-grid-name" for="node-text">text</label><div class="property-grid-value"><input id="node-text" aria-label="Текст выбранного компонента" :value="node.props?.text??''" @input="setProp('text',$event.target.value)"></div></div>
     <template v-if="rangeType"><div v-for="key in ['min','max','value']" :key="key" class="property-grid-row"><span class="property-grid-name">{{key}}</span><div class="property-grid-value"><NumberInput class="style-number" :aria-label="'Компонент '+key" :value="node.props?.[key]??''" @input="number(key,$event)"/></div></div></template>
     <div v-if="['checkbox','switch'].includes(node.type)" class="property-grid-row"><label class="property-grid-name" for="node-checked">checked</label><div class="property-grid-value"><input id="node-checked" type="checkbox" :checked="nodeProps.checked??false" @change="setProp('checked',$event.target.checked)"></div></div>
     <div v-if="node.type==='image'" class="property-grid-row"><label class="property-grid-name" for="node-resource">resource</label><div class="property-grid-value"><input id="node-resource" aria-label="Ресурс изображения" :value="node.props?.src??''" @change="setProp('src',$event.target.value)"></div></div>
     <template v-if="node.type==='dropdown'"><div class="property-grid-row screen-multiline-row"><label class="property-grid-name" for="node-options">options</label><div class="property-grid-value"><textarea id="node-options" aria-label="Варианты списка" rows="3" :value="node.props?.options?.join('\n')??''" @change="setProp('options',$event.target.value.split('\n'))"></textarea></div></div><div class="property-grid-row"><span class="property-grid-name">selected</span><div class="property-grid-value"><NumberInput aria-label="Выбранный вариант списка" :min="0" :max="Math.max(0,(node.props?.options?.length??1)-1)" :value="node.props?.selected??''" @input="number('selected',$event)"/></div></div></template>
     <div v-if="node.type==='line'" class="property-grid-row"><label class="property-grid-name" for="node-points">points</label><div class="property-grid-value"><input id="node-points" aria-label="Точки линии" :value="JSON.stringify(node.props?.points??[])" @change="points"></div></div>
    </div>
   </CornerFrame></div>
   <div class="geometry-group"><CornerFrame class="property-grid" title="Флаги" role="group" aria-label="Флаги компонента"><template #side><span>Флаги</span></template><div class="property-grid-rows"><div v-for="(help,key) in flags" :key="key" class="property-grid-row"><label class="property-grid-name" :for="'node-'+key" :data-tooltip="help">{{key}}</label><div class="property-grid-value"><input :id="'node-'+key" type="checkbox" :aria-label="key" :checked="nodeFlags[key]??false" @change="setFlag(key,$event.target.checked)"></div></div></div></CornerFrame></div>
  </CornerFrame>
  <ViewEditor :model-value="node" :screen="screen" :capabilities="capabilities" @update:model-value="emit('update:modelValue',$event)"/>
  <BindingEditor v-if="componentFamily" :model-value="node" :screen="screen" :family="componentFamily" :capabilities="capabilities" @update:model-value="emit('update:modelValue',$event)"/>
  <input v-model="query" class="screen-property-search" type="search" aria-label="Поиск стилей компонента" placeholder="Свойство / название / тип…">
  <ProjectStyleUses :model-value="node.styles??[]" :screen-styles="screenStyles" @update:model-value="edit(n=>n.styles=$event)"/>
  <div class="property-groups">
   <StyleSection v-for="section in editorSections" :key="section.id" :section="section.id" :model-value="scalarStyle" :resources="resources" :query="query" :exclude-groups="['size','grid','layout']" :exclude-fields="['flex_flow']" :extra-content="section.id==='layout'||(section.id==='geometry'&&!!parent)" @update:model-value="updateStyle">
    <template #before-groups>
     <template v-if="section.id==='geometry'">
      <div v-if="parent" class="geometry-group"><CornerFrame class="geometry-grid" title="Размеры" role="group" aria-label="Размеры компонента"><template #header><div class="geometry-grid-header"><span></span><span>X/W</span><span>Y/H</span></div></template><template #side><span>Размеры</span></template><div class="geometry-grid-rows"><div v-for="[label,x,y] in [['size','width','height'],['min','min_width','min_height'],['max','max_width','max_height']]" :key="label" class="geometry-grid-row"><span class="geometry-grid-name">{{label}}</span><div v-for="key in [x,y]" :key="key" class="geometry-grid-value"><ScreenDimensionValue :name="key" :model-value="node.style?.[key]" @update:model-value="setStyle(key,$event)" @invalid="emit('invalid',$event)"/></div></div></div></CornerFrame></div>
      <p v-else class="screen-runtime-note">Размер экрана — W/H в предпросмотре.</p>
     </template>
     <template v-if="section.id==='layout'">
      <div class="geometry-group"><CornerFrame class="property-grid" title="Алгоритм" role="group" aria-label="Алгоритм компоновки"><template #side><span>Layout</span></template><div class="property-grid-rows">
       <div class="property-grid-row"><span class="property-grid-name">layout</span><div class="property-grid-value"><ClearableSelect aria-label="Раскладка выбранного компонента" :value="node.style?.layout??''" @change="setStyle('layout',$event.target.value)"><option value="">—</option><option>LV_LAYOUT_NONE</option><option v-if="layouts.includes(1)">LV_LAYOUT_FLEX</option><option v-if="layouts.includes(2)">LV_LAYOUT_GRID</option></ClearableSelect></div></div>
       <div v-if="node.style?.layout==='LV_LAYOUT_FLEX'" class="property-grid-row"><span class="property-grid-name">flow</span><div class="property-grid-value"><ClearableSelect aria-label="Flex flow экрана" :value="node.style?.flex_flow??''" @change="setStyle('flex_flow',$event.target.value)"><option value="">—</option><option v-for="flow in flows" :key="flow">{{flow}}</option></ClearableSelect></div></div>
      </div></CornerFrame></div>
      <div v-if="node.style?.layout==='LV_LAYOUT_GRID'" class="geometry-group"><CornerFrame class="property-grid" title="Grid" role="group" aria-label="Дорожки Grid"><template #side><span>Grid</span></template><div class="property-grid-rows"><div v-for="[label,key] in [['columns','grid_column_dsc_array'],['rows','grid_row_dsc_array']]" :key="key" class="property-grid-row"><span class="property-grid-name">{{label}}</span><div class="property-grid-value"><input :aria-label="'Grid '+label" placeholder="120, 1fr, content" :value="formatTracks(node.style?.[key])" @change="tracks(key,$event)"></div></div><div v-for="key in ['grid_column_align','grid_row_align']" :key="key" class="property-grid-row"><span class="property-grid-name">{{key.replace('grid_','')}}</span><div class="property-grid-value"><ClearableSelect :aria-label="key" :value="node.style?.[key]??''" @change="setStyle(key,$event.target.value)"><option value="">—</option><option v-for="name in Object.keys(contract.enums.lv_grid_align_t)" :key="name">{{name}}</option></ClearableSelect></div></div></div></CornerFrame></div>
      <div v-if="parent?.style?.layout==='LV_LAYOUT_GRID'" class="geometry-group"><CornerFrame class="property-grid" title="Ячейка" role="group" aria-label="Ячейка Grid"><template #side><span>Ячейка</span></template><div class="property-grid-rows"><div v-for="key in ['grid_cell_column_pos','grid_cell_row_pos','grid_cell_column_span','grid_cell_row_span']" :key="key" class="property-grid-row"><span class="property-grid-name">{{key.replace('grid_cell_','')}}</span><div class="property-grid-value"><NumberInput :aria-label="key" :min="key.endsWith('span')?1:0" :value="node.style?.[key]??''" @input="number(key,$event,true)"/></div></div><div v-for="key in ['grid_cell_x_align','grid_cell_y_align']" :key="key" class="property-grid-row"><span class="property-grid-name">{{key.replace('grid_cell_','')}}</span><div class="property-grid-value"><ClearableSelect :aria-label="key" :value="node.style?.[key]??''" @change="setStyle(key,$event.target.value)"><option value="">—</option><option v-for="name in Object.keys(contract.enums.lv_grid_align_t)" :key="name">{{name}}</option></ClearableSelect></div></div></div></CornerFrame></div>
     </template>
    </template>
   </StyleSection>
  </div>
 </div>
</template>

