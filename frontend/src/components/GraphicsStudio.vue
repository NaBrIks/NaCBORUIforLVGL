<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {onBeforeUnmount,onMounted,ref} from 'vue';
import {appearance,t} from '../state/appearance';
import NativeViewer from './NativeViewer.vue';
import AssistantPanel from './AssistantPanel.vue';
import AssistantLog from './AssistantLog.vue';
import AppearanceMenu from './AppearanceMenu.vue';
import Icon from './Icon.vue';
import ProjectRecovery from './ProjectRecovery.vue';
const settings=ref(new URLSearchParams(location.search).get('page')==='settings');
const tab=ref('log'),records=ref([]);
function tabKey(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();tab.value=event.key==='Home'?'log':event.key==='End'?'preview':tab.value==='log'?'preview':'log';event.currentTarget.querySelector('[data-studio-tab="'+tab.value+'"]').focus();}
function select(value){settings.value=value;const url=new URL(location.href);url.pathname='/editor/';url.searchParams.delete('page');if(value)url.searchParams.set('page','settings');history.pushState({},'',url);}
function restore(){settings.value=new URLSearchParams(location.search).get('page')==='settings';}
onMounted(()=>window.addEventListener('popstate',restore));onBeforeUnmount(()=>window.removeEventListener('popstate',restore));
</script>
<template>
 <main class="app-shell graphics-studio">
  <header class="topbar graphics-studio-head"><strong class="brand">{{t('Графика LVGL','LVGL Graphics')}}</strong><ProjectRecovery mode="show"/><div class="appearance-controls"><AppearanceMenu/><button class="language-button" @click="appearance.language=appearance.language==='ru'?'en':'ru'">{{appearance.language.toUpperCase()}}</button></div></header>
  <aside class="sidebar"><nav class="graphics-studio-navigation" :aria-label="t('Рабочая область','Workspace')"><section class="nav-group"><button :class="{active:!settings}" :aria-current="!settings?'page':undefined" @click="select(false)"><Icon name="device-desktop"/><span>{{t('Работа','Work')}}</span></button></section><section class="nav-group"><button :class="{active:settings}" :aria-current="settings?'page':undefined" @click="select(true)"><Icon name="settings"/><span>{{t('Настройки','Settings')}}</span></button></section></nav></aside>
  <div class="workspace graphics-studio-body"><AssistantPanel class="graphics-studio-assistant" persistent :mode="settings?'settings':'work'" @log="records=$event"/><section v-show="!settings" class="graphics-studio-work"><nav class="graphics-studio-tabs" role="tablist" :aria-label="t('Результат работы','Work result')" @keydown="tabKey"><button id="studio-log-tab" role="tab" data-studio-tab="log" aria-controls="studio-log-view" :aria-selected="tab==='log'" :tabindex="tab==='log'?0:-1" :class="{active:tab==='log'}" @click="tab='log'">{{t('Лог','Log')}}</button><button id="studio-preview-tab" role="tab" data-studio-tab="preview" aria-controls="studio-native-preview" :aria-selected="tab==='preview'" :tabindex="tab==='preview'?0:-1" :class="{active:tab==='preview'}" @click="tab='preview'">{{t('Предпросмотр экрана','Screen preview')}}</button></nav><div id="studio-log-view" v-show="tab==='log'" class="graphics-studio-pane" role="tabpanel" aria-labelledby="studio-log-tab"><AssistantLog :records="records" :active="!settings&&tab==='log'"/></div><div id="studio-native-preview" v-show="tab==='preview'" class="graphics-studio-pane" role="tabpanel" aria-labelledby="studio-preview-tab"><NativeViewer embedded :active="!settings&&tab==='preview'"/></div></section></div>
 </main>
</template>
<style scoped>
.graphics-studio{min-width:0;min-height:0;background:var(--lu-bg-canvas);color:var(--lu-text);}
.graphics-studio-head{min-width:0;}.graphics-studio-head .appearance-controls{margin-left:auto;}
.graphics-studio-body{overflow:hidden;}.graphics-studio-work{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;width:100%;}.graphics-studio-tabs{display:flex;align-items:flex-end;gap:0;flex:none;padding:4px 8px 0;border-bottom:1px solid var(--lu-input-border);background:var(--lu-surface-alt);}.graphics-studio-tabs button{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:3px 12px;margin-bottom:-1px;border:1px solid var(--lu-input-border);border-radius:3px 3px 0 0;background:var(--lu-surface-alt);color:var(--lu-text-muted);font:inherit;white-space:nowrap;}.graphics-studio-tabs button+button{margin-left:-1px;}.graphics-studio-tabs button:hover{background:var(--lu-primary-light);color:var(--lu-text);}.graphics-studio-tabs button.active{z-index:1;border-color:var(--lu-primary);border-bottom-color:var(--lu-surface);color:var(--lu-text);background:var(--lu-surface);font-weight:600;}.graphics-studio-pane{flex:1;min-height:0;min-width:0;background:var(--lu-surface);}
</style>
