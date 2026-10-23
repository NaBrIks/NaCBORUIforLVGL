<script setup>
import {computed,inject} from 'vue';
import {compositionAvailable,validateView} from '@lvgl-cbor/screen-codec';
import CornerFrame from '../../components/CornerFrame.vue';
import Icon from '../../components/Icon.vue';
import './composition.css';
const props=defineProps({modelValue:Object,screen:Object,capabilities:Object}),emit=defineEmits(['update:modelValue']);
const project=inject('lvgl-project',null),screens=computed(()=>Object.values(project?.workspace.project.value.screens??{})),available=computed(()=>compositionAvailable(props.capabilities));
const view=computed(()=>props.modelValue.view),choices=computed(()=>screens.value.filter(screen=>!view.value?.pages.some(page=>page.screen===screen.id))),first=computed(()=>screens.value.find(screen=>screen.id!==props.screen?.id));
const error=computed(()=>{if(!view.value)return '';try{validateView(view.value,props.capabilities);return '';}catch(e){return e.message;}});
function update(next){const node={...props.modelValue};if(next===undefined)delete node.view;else node.view=next;emit('update:modelValue',node);}
function enable(value){update(value?{pages:[{screen:first.value.id,retention:'release'}],initial:first.value.id,sizing:'fill'}:undefined);}
function page(index,key,value){const pages=view.value.pages.map((page,i)=>i===index?{...page,[key]:value}:page),initial=key==='screen'&&view.value.initial===view.value.pages[index].screen?value:view.value.initial;update({...view.value,pages,initial});}
function remove(index){const pages=view.value.pages.filter((_,i)=>i!==index);update({...view.value,pages,initial:pages.some(page=>page.screen===view.value.initial)?view.value.initial:pages[0]?.screen??''});}
</script>
<template><CornerFrame class="property-category view-editor" :level="1" title="Вложенные страницы"><template #header><h3>Вложенные страницы</h3></template>
 <label class="view-enable"><input type="checkbox" aria-label="Контейнер вложенных страниц" :checked="!!view" :disabled="!view&&(!available||!first)" @change="enable($event.target.checked)">Контейнер страниц</label>
 <template v-if="view">
  <div class="view-page-row" v-for="(entry,index) in view.pages" :key="index"><select :aria-label="'Страница контейнера '+(index+1)" :value="entry.screen" @change="page(index,'screen',$event.target.value)"><option v-if="!screens.some(screen=>screen.id===entry.screen)" :value="entry.screen">{{entry.screen}} · отсутствует</option><option v-for="screen in screens.filter(screen=>screen.id===entry.screen||!view.pages.some(page=>page.screen===screen.id))" :key="screen.id" :value="screen.id">{{screen.name}} · {{screen.id}}</option></select><select :aria-label="'Хранение страницы '+(index+1)" :value="entry.retention??'release'" @change="page(index,'retention',$event.target.value)"><option value="release">Освобождать</option><option value="cache">Кэшировать</option><option value="retain">Удерживать</option></select><button class="action-button icon-action" :disabled="view.pages.length<=1" :aria-label="'Убрать страницу '+(index+1)" data-tooltip="Убрать допустимую страницу" @click="remove(index)"><Icon name="trash"/></button></div>
  <button class="action-button icon-action" aria-label="Добавить страницу контейнера" :disabled="!choices.length" data-tooltip="Добавить допустимую страницу" @click="update({...view,pages:[...view.pages,{screen:choices[0].id,retention:'release'}]})"><Icon name="plus"/></button>
  <div class="view-option"><label>Начальная</label><select aria-label="Начальная страница контейнера" :value="view.initial" @change="update({...view,initial:$event.target.value})"><option v-if="!view.pages.some(page=>page.screen===view.initial)" :value="view.initial">{{view.initial}}</option><option v-for="entry in view.pages" :key="entry.screen" :value="entry.screen">{{screens.find(screen=>screen.id===entry.screen)?.name??entry.screen}}</option></select></div>
  <div class="view-option"><label>Размер</label><select aria-label="Размер вложенной страницы" :value="view.sizing??'fill'" @change="update({...view,sizing:$event.target.value})"><option value="fill">По контейнеру</option><option value="design">Размер документа</option></select></div>
  <p class="muted view-note">Скрытые страницы приостановлены. Кэш может быть освобождён; «Удерживать» сохраняет экземпляр.</p>
 </template>
 <p v-if="!available" class="bad view-note">Подключённая прошивка не поддерживает вложенные страницы.</p><p v-if="error" class="bad view-note" role="alert">{{error}}</p>
</CornerFrame></template>
