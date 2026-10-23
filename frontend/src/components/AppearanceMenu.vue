<script setup lang="ts">
import {computed,ref,onBeforeUnmount} from 'vue';
import {appearance,t} from '../state/appearance';
import Icon from './Icon.vue';
const menu=ref<HTMLDetailsElement>();
const autoCloseDelayMs=1500;
let closeTimer:ReturnType<typeof setTimeout>|undefined;
let pointerInside=false;
function cancelClose(){clearTimeout(closeTimer);closeTimer=undefined;}
function scheduleClose(){cancelClose();closeTimer=setTimeout(()=>{
 const focused=document.activeElement;
 if(pointerInside||focused&&menu.value?.contains(focused)&&focused.matches(':focus-visible'))return;
 close(false);
},autoCloseDelayMs);}
function enter(){pointerInside=true;cancelClose();}
function leave(){pointerInside=false;scheduleClose();}
function focusOut(event:FocusEvent){if(!(event.relatedTarget instanceof Node)||!menu.value?.contains(event.relatedTarget))scheduleClose();}
onBeforeUnmount(cancelClose);
const themes=computed(()=>[
 {id:'light',name:t('Светлая','Light'),icon:'sun'},
 {id:'cream',name:t('Кремовая','Cream'),icon:'ice-cream'},
 {id:'emerald',name:t('Изумрудная','Emerald'),icon:'trees'},
 {id:'dark',name:t('Тёмная','Dark'),icon:'moon'}]);
const densities=computed(()=>[
 {id:'nano',name:t('Ультракомпактная','Ultra compact'),icon:'baseline-density-small'},
 {id:'mini',name:t('Компактная','Compact'),icon:'baseline-density-medium'},
 {id:'norm',name:t('Обычная','Normal'),icon:'baseline-density-large'}]);
const themeName=computed(()=>themes.value.find(item=>item.id===appearance.theme)?.name);
function close(restoreFocus=true){cancelClose();if(menu.value){menu.value.open=false;if(restoreFocus)menu.value.querySelector('summary')?.focus();}}
</script>
<template>
 <details ref="menu" class="appearance" @pointerenter="enter" @pointerleave="leave" @focusin="cancelClose" @focusout="focusOut" @toggle="!menu?.open&&cancelClose()" @keydown.esc.stop.prevent="close()">
  <summary :aria-label="t('Оформление','Appearance')"><Icon name="palette"/> {{themeName}} · {{appearance.density.toUpperCase()}}</summary>
  <div class="appearance-menu">
   <strong>{{t('Цветовая схема','Color scheme')}}</strong>
   <button v-for="item in themes" :key="item.id" :class="{selected:appearance.theme===item.id}" :aria-label="item.name" :aria-pressed="appearance.theme===item.id" @click="appearance.theme=item.id"><Icon :name="item.icon"/>{{item.name}}<span v-if="appearance.theme===item.id" aria-hidden="true">✓</span></button>
   <strong>{{t('Плотность','Density')}}</strong>
   <button v-for="item in densities" :key="item.id" :class="{selected:appearance.density===item.id}" :aria-label="item.name" :aria-pressed="appearance.density===item.id" @click="appearance.density=item.id"><Icon :name="item.icon"/>{{item.name}}<span v-if="appearance.density===item.id" aria-hidden="true">✓</span></button>
   <strong>{{t('Подсказки','Tooltips')}}</strong>
   <button role="switch" :aria-checked="appearance.tooltips" :aria-label="t('Показывать подсказки','Show tooltips')" :class="{selected:appearance.tooltips}" @click="appearance.tooltips=!appearance.tooltips"><Icon name="help-circle"/>{{t('Показывать подсказки','Show tooltips')}}<span v-if="appearance.tooltips" aria-hidden="true">✓</span></button>
  </div>
 </details>
</template>
