<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import {computed,inject,ref,watch} from 'vue';
import {t} from '../state/appearance';
import {useScreenPreviewSettings} from '../state/screen-preview-settings.js';
import VirtualScreen from './VirtualScreen.vue';
import Icon from './Icon.vue';
import PagePreviewTarget from './PagePreviewTarget.vue';
import {flattenNodes} from '../screen-model';
import {unsupportedProperties} from '../preview-style';
const {standardWidgets:availableWidgets}=useRuntimeCapabilities();
const project=inject('lvgl-project',null);
const props=defineProps({screen:{type:Object,required:true},settings:{type:Object,required:true},selected:String,mode:{type:String,default:'component'},componentType:{type:String,default:'label'},text:{type:String,default:'LVGL preview'}});
const emit=defineEmits(['update:settings','resize','select','update:componentType','update:text']);
const {showHidden}=useScreenPreviewSettings(()=>props.screen.id);
const contained=ref(false),interactive=ref(false),sizing=ref('design'),viewport=ref({...props.screen.size});
function pageSize(){contained.value=false;viewport.value={...props.screen.size};}
watch([()=>props.screen.id,()=>props.mode],()=>{pageSize();interactive.value=false;});
watch(contained,value=>{if(value){viewport.value={...props.screen.size};sizing.value='design';}});
const plan=computed(()=>props.mode==='screen'?project?.pagePreview?.browser.value:null);
const inProjectContainer=computed(()=>!!plan.value?.path.length);
const canvasScreen=computed(()=>plan.value?.project.screens[plan.value.screen]??props.screen);
const editSize=computed(()=>contained.value&&!inProjectContainer.value?viewport.value:props.screen.size);
const displaySize=computed(()=>inProjectContainer.value?canvasScreen.value.size:editSize.value);
watch(()=>project?.pagePreview?.target.value,()=>pageSize());
const unsupported=computed(()=>[...new Set(flattenNodes(props.screen.root).flatMap(({node})=>unsupportedProperties(node,props.screen,project?.workspace.project.value.styles)))]);
function setting(key,value){emit('update:settings',{...props.settings,[key]:value});}
function size(key,event){const value=Number(event.target.value);if(Number.isInteger(value)&&value>=1&&value<=8192){if(contained.value)viewport.value={...viewport.value,[key]:value};else emit('resize',{...props.screen.size,[key]:value});}}
</script>
<template><aside class="preview-panel panel"><div class="panel-head"><h2>{{mode==='component'?'Компонент':'Раскладка экрана'}}</h2><span class="muted" data-tooltip="Быстрый предпросмотр средствами CSS. Шрифты, темы LVGL и часть эффектов могут отличаться; код LVGL в браузере не исполняется.">CSS ≈ LVGL</span></div>
 <slot name="actions"/>
 <div class="preview-toolbar">
  <PagePreviewTarget v-if="mode==='screen'&&project?.pagePreview"/>
  <label :data-tooltip="contained?'Ширина контейнера просмотра, px; документ не меняется':'Проектная ширина страницы, px; сохраняется в документе'">W<input type="number" min="1" max="8192" aria-label="Ширина виртуального экрана" :value="editSize.width" @input="size('width',$event)"></label>
  <label :data-tooltip="contained?'Высота контейнера просмотра, px; документ не меняется':'Проектная высота страницы, px; сохраняется в документе'">H<input type="number" min="1" max="8192" aria-label="Высота виртуального экрана" :value="editSize.height" @input="size('height',$event)"></label>
  <label :data-tooltip="t('Масштаб предпросмотра','Preview zoom')"><Icon name="zoom-in"/><select aria-label="Масштаб экрана" :value="settings.zoom" @change="setting('zoom',Number($event.target.value))"><option :value="0">Авто</option><option v-for="n in [25,50,75,100,150,200,400]" :key="n" :value="n">{{n}} %</option></select></label>
  <label :data-tooltip="t('Шаг сетки, px','Grid spacing, px')"><Icon name="apps"/><select aria-label="Сетка экрана" :value="settings.grid" @change="setting('grid',Number($event.target.value))"><option :value="0">Нет</option><option v-for="n in [4,8,10,16,20,40]" :key="n" :value="n">{{n}} px</option></select></label>
  <button v-if="mode==='screen'" class="preview-icon-button" :class="{selected:showHidden}" :aria-pressed="showHidden" :aria-label="t('Показать скрытые · 25%','Show hidden · 25%')" :data-tooltip="t('Показать скрытые элементы с непрозрачностью 25%. Только в браузере; в Flex/Grid элементы займут место.','Show hidden elements at 25% opacity. Browser only; elements take space in Flex/Grid.')" @click="showHidden=!showHidden"><Icon :name="showHidden?'eye':'eye-off'"/></button>
  <template v-if="mode==='screen'"><template v-if="!inProjectContainer"><label data-tooltip="Только просмотр: W/H задают произвольную область, размер документа не меняется"><input type="checkbox" v-model="contained" aria-label="Просмотр в контейнере">Свой размер области</label><template v-if="contained"><select v-model="sizing" aria-label="Размер страницы в предпросмотре"><option value="fill">По контейнеру</option><option value="design">Размер документа</option></select><button @click="pageSize" data-tooltip="Вернуть область просмотра к проектному размеру выбранной страницы">Размер страницы</button></template></template><label data-tooltip="Переходы выполняются только в браузере; данные приложения не записываются"><input type="checkbox" v-model="interactive" aria-label="Проверять переходы в браузере">Переходы</label></template>
  <template v-if="mode==='component'">
   <label :data-tooltip="t('Тип компонента предпросмотра','Preview component type')"><Icon name="category"/><select aria-label="Тип компонента предпросмотра" :value="componentType" @change="emit('update:componentType',$event.target.value)"><option v-for="type in availableWidgets" :key="type">{{type}}</option></select></label>
   <label class="preview-text-control" :data-tooltip="t('Текст компонента предпросмотра','Preview component text')"><Icon name="text-size"/><input aria-label="Текст компонента предпросмотра" :value="text" @input="emit('update:text',$event.target.value)"></label>
  </template>
 </div>
 <VirtualScreen :width="displaySize.width" :height="displaySize.height" :screen="canvasScreen" :screens="plan?.project.screens" :focus-path="plan?.path" :grid="settings.grid" :zoom="settings.zoom" :selected="selected" :show-hidden="mode==='screen'&&showHidden" :interactive="mode==='screen'&&interactive" :contained="contained&&!inProjectContainer" :mount-sizing="sizing" @select="emit('select',$event)"/>
 <details class="preview-limitations"><summary>Точность предпросмотра{{unsupported.length?' · не показано: '+unsupported.length:''}}</summary><p>Размеры, min/max, border, outline, тени, Flex и Grid показаны приближённо. Образцы частей виджетов используют нейтральное оформление. Точные шрифты, тема, состояния, события и привязки требуют проверки в LVGL.</p><p v-if="unsupported.length">Не воспроизведены: <code>{{unsupported.join(', ')}}</code></p></details>
 </aside></template>
