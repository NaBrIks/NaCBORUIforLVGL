<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,ref,watch} from 'vue';
import {t} from '../state/appearance';
import {flattenNodes} from '../screen-model.js';
import {screenExamples} from '../screen-examples';
import {readSaved,save} from '../state/persistence.js';
import ScreenThumbnail from './ScreenThumbnail.vue';
import ScreenActions from './ScreenActions.vue';
import Icon from './Icon.vue';
const props=defineProps({screens:{type:Array,required:true},screenId:String,deletedScreen:Object});
const emit=defineEmits(['select','open','add','add-blank','add-example','remove','undo','rename','duplicate']);
const example=ref('blank'),search=ref('');
const views=[{id:'table',icon:'list',ru:'Таблица',en:'Table'},{id:'rows',icon:'list-details',ru:'Строки с превью',en:'Preview rows'},{id:'panels',icon:'apps',ru:'Панели',en:'Panels'}];
const savedView=readSaved('lvgl-cbor-screen-list-view','rows');
const view=ref(views.some(item=>item.id===savedView)?savedView:'rows');
watch(view,value=>save('lvgl-cbor-screen-list-view',value));
const rows=computed(()=>props.screens.filter(screen=>`${screen.name} ${screen.id}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())).map(screen=>({screen,count:flattenNodes(screen.root).length})));
function add(){search.value='';if(example.value==='blank')emit('add-blank');else if(example.value)emit('add-example',example.value);else emit('add');}
function duplicate(id){search.value='';emit('duplicate',id);}
function rename(screen,event){emit('rename',screen.id,event.target.value);event.target.value=screen.name;}
</script>
<template>
 <section class="screen-manager" :aria-label="t('Управление экранами','Screen management')">
  <div class="screen-manager-toolbar">
   <label>{{t('Новый экран','New screen')}} <select v-model="example" :aria-label="t('Шаблон нового экрана','New screen template')"><option value="blank">{{t('Пустой экран','Empty screen')}}</option><option value="">{{t('Стандартный пример','Default example')}}</option><option v-for="(doc,id) in screenExamples" :key="id" :value="id">{{doc.name}}</option></select></label>
   <button class="action-button primary" @click="add"><Icon name="plus"/>{{t('Добавить экран','Add screen')}}</button>
   <div class="screen-view-switch" role="group" :aria-label="t('Представление экранов','Screen view')"><button v-for="item in views" :key="item.id" :aria-label="t(item.ru,item.en)" :data-tooltip="t(item.ru,item.en)" :aria-pressed="view===item.id" :class="{selected:view===item.id}" @click="view=item.id"><Icon :name="item.icon"/></button></div>
   <input v-model="search" type="search" :aria-label="t('Поиск экранов','Search screens')" :placeholder="t('Название или ID','Name or ID')">
   <span class="screen-manager-count">{{rows.length}} / {{screens.length}}</span>
   <span v-if="view!=='table'" class="screen-runtime-note" :data-tooltip="t('Приблизительный CSS-предпросмотр. LVGL в браузере не исполняется.','Approximate CSS preview. LVGL does not run in the browser.')">CSS ≈ LVGL</span>
  </div>
  <div v-if="deletedScreen" class="screen-manager-undo" role="status"><span>{{t('Удалён','Deleted')}}: {{deletedScreen.doc.name}}</span><button class="action-button" @click="search='';emit('undo')"><Icon name="arrow-left"/>{{t('Отменить удаление','Undo deletion')}}</button></div>
  <div class="screen-list-scroll" :class="{'screen-panels-scroll':view==='panels'}">
   <div v-if="view==='panels'" class="screen-panels">
    <article v-for="{screen,count} in rows" :key="screen.id" class="screen-tile" :class="{selected:screen.id===screenId}" :aria-label="screen.name" @click="emit('select',screen.id)" @focusin="emit('select',screen.id)">
     <input class="screen-name-input" :value="screen.name" :aria-label="t('Название экрана ','Screen name ')+screen.id" :data-tooltip="screen.name" @change="rename(screen,$event)" @keydown.enter="rename(screen,$event);$event.target.blur()" @keydown.esc="$event.target.value=screen.name;$event.target.blur()">
     <ScreenThumbnail :screen="screen" @open="emit('open',$event)"/>
     <dl class="screen-tile-details"><dt>ID</dt><dd><code :data-tooltip="screen.id">{{screen.id}}</code></dd><dt>{{t('Размер, px','Size, px')}}</dt><dd class="screen-tile-size"><span>{{screen.size.width}}</span><span>×</span><span>{{screen.size.height}}</span></dd><dt>{{t('Узлы','Nodes')}}</dt><dd>{{count}}</dd></dl>
     <ScreenActions :screen="screen" :can-remove="screens.length>1" @open="emit('open',$event)" @duplicate="duplicate" @remove="emit('remove',$event)"/>
    </article>
    <p v-if="!rows.length">{{t('Экраны не найдены','No matching screens')}}</p>
   </div>
   <table v-else class="screen-list" :class="{'with-previews':view==='rows'}" :aria-label="t('Список экранов','Screen list')">
    <colgroup><col v-if="view==='rows'" class="screen-list-preview"><col class="screen-list-name"><col class="screen-list-id"><col class="screen-list-size"><col class="screen-list-size"><col class="screen-list-count"><col class="screen-list-actions"></colgroup>
    <thead><tr><th v-if="view==='rows'">{{t('Предпросмотр','Preview')}}</th><th>{{t('Название','Name')}}</th><th>ID</th><th class="numeric">W, px</th><th class="numeric">H, px</th><th class="numeric">{{t('Узлы','Nodes')}}</th><th>{{t('Действия','Actions')}}</th></tr></thead>
    <tbody><tr v-for="{screen,count} in rows" :key="screen.id" :class="{selected:screen.id===screenId}" @click="emit('select',screen.id)" @focusin="emit('select',screen.id)">
     <td v-if="view==='rows'"><ScreenThumbnail :screen="screen" @open="emit('open',$event)"/></td>
     <td><input class="screen-name-input" :value="screen.name" :aria-label="t('Название экрана ','Screen name ')+screen.id" :data-tooltip="screen.name" @change="rename(screen,$event)" @keydown.enter="rename(screen,$event);$event.target.blur()" @keydown.esc="$event.target.value=screen.name;$event.target.blur()"></td>
     <td><code :data-tooltip="screen.id">{{screen.id}}</code></td><td class="numeric">{{screen.size.width}}</td><td class="numeric">{{screen.size.height}}</td><td class="numeric">{{count}}</td>
     <td><ScreenActions :screen="screen" :can-remove="screens.length>1" @open="emit('open',$event)" @duplicate="duplicate" @remove="emit('remove',$event)"/></td>
    </tr><tr v-if="!rows.length"><td :colspan="view==='rows'?7:6">{{t('Экраны не найдены','No matching screens')}}</td></tr></tbody>
   </table>
  </div>
 </section>
</template>
