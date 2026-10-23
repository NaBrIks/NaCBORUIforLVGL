<script setup>
import {defineAsyncComponent,inject,onMounted} from 'vue';
import {t} from '../state/appearance';
import Icon from './Icon.vue';
import ProjectDeviceDetails from './ProjectDeviceDetails.vue';
import CompositionGraph from '../modules/composition/CompositionGraph.vue';
const {workspace,controller}=inject('lvgl-project'),caps=inject('lvgl-authoring-capabilities');
const {project,source,warning}=workspace,{deviceProject,projectBusy,projectMessage,available,following,projectDirty,projectConflict,projectEvents}=controller;
const DocumentFiles=import.meta.env.VITE_LVGL_CBOR_FILES==='false'?null:defineAsyncComponent(()=>import('../modules/document-files/DocumentFiles.vue'));
async function openFile(document,{filename}){controller.stopFollowing();await workspace.replace(document,t('Файл: ','File: ')+filename);}
onMounted(()=>controller.refresh());
</script>
<template><div class="project-page">
 <section class="panel project-device" aria-label="Проект на МК">
  <div class="panel-head"><h2>{{t('Проект на МК','MCU project')}}</h2><button class="action-button icon-action" :disabled="!available||projectBusy" aria-label="Обновить сведения о проекте МК" :data-tooltip="t('Обновить права, хранение и состояние проекта','Refresh project permissions, storage and status')" @click="controller.refresh()"><Icon name="refresh"/></button></div>
  <div class="project-actions">
   <button class="action-button primary" :disabled="!available||projectBusy" aria-label="Открыть проект с МК" :data-tooltip="t('Загрузить сохранённый проект МК в редактор. Дисплей не переключается.','Load the saved MCU project into the editor. The display stays unchanged.')" @click="controller.openDevice()"><Icon name="cloud-download"/>{{t('Открыть с МК','Open from MCU')}}</button>
   <button class="action-button" :disabled="!available||!deviceProject?.storage.writable||!Object.values(deviceProject?.policy??{}).some(Boolean)||projectBusy" aria-label="Сохранить проект на МК" :data-tooltip="t('Записать весь рабочий проект в настроенный слой изменений МК. Дисплей не переключается.','Write the whole working project to the configured MCU changes store. The display stays unchanged.')" @click="controller.saveDevice()"><Icon name="cloud-upload"/>{{t('Сохранить на МК','Save to MCU')}}</button>
   <span v-if="deviceProject" class="project-storage-summary">{{deviceProject.storage.writable?(t('Запись: ','Writes: ')+deviceProject.storage.kind+' · '+(deviceProject.storage.persistent?t('постоянно','persistent'):t('до перезапуска МК','until MCU restart'))):t('МК: только чтение','MCU: read only')}}</span>
  </div>
  <p v-if="projectMessage" class="project-note project-result" role="status">{{projectMessage}}</p>
  <p v-if="following" class="project-note" :class="{bad:projectConflict}" :role="projectConflict?'alert':'status'">{{projectConflict?t('Проект на МК изменён. Локальные правки сохранены в редакторе; для замены нажмите «Открыть с МК».','The MCU project changed. Local edits are kept in the editor; use Open from MCU to replace them.'):projectDirty?t('Есть локальные правки — автоматическая загрузка с МК приостановлена.','Local edits pause automatic loading from the MCU.'):projectEvents?t('Изменения проекта подхватываются по событиям WS.','Project changes are loaded on WS events.'):t('Эта прошивка не объявляет WS-события проекта. Обновите прошивку для автоматического подхвата.','This firmware does not advertise project WS events. Update firmware for automatic loading.')}}</p>
  <ProjectDeviceDetails v-if="deviceProject" :status="deviceProject"/>
  <p v-else class="project-note">{{available?t('Получение сведений с МК…','Retrieving MCU project…'):t('Подключите МК с API проектов. Локальное редактирование и файлы доступны без платы.','Connect an MCU with the project API. Local editing and files work without a device.')}}</p>
 </section>
 <section class="panel project-document" aria-label="Рабочий проект">
  <div class="panel-head"><h2>{{t('Проект','Project')}}</h2><span class="muted">{{source}}</span></div>
  <div class="project-fields">
   <label for="project-name">{{t('Название','Name')}}</label><input id="project-name" v-model="project.manifest.name" aria-label="Название проекта">
   <label for="project-id">ID</label><input id="project-id" v-model="project.manifest.id" aria-label="ID проекта" spellcheck="false">
   <label for="project-entry">{{t('Стартовый экран','Startup screen')}}</label><select id="project-entry" v-model="project.manifest.entry" aria-label="Стартовый экран"><option v-for="screen in project.screens" :key="screen.id" :value="screen.id">{{screen.name}}</option></select>
   <label for="project-description">{{t('Описание','Description')}}</label><input id="project-description" :value="project.manifest.description??''" aria-label="Описание проекта" @input="project.manifest.description=$event.target.value">
   <span>{{t('Состав','Contents')}}</span><span class="project-contents"><span>{{t('Экранов','Screens')}}: {{Object.keys(project.screens).length}}</span><span>{{t('Общих стилей','Shared styles')}}: {{Object.keys(project.styles).length}}</span></span>
  </div>
  <p v-if="warning" class="bad project-note" role="alert">{{warning}}</p>
 </section>
 <CompositionGraph :project="project"/>
 <section v-if="DocumentFiles" class="panel" aria-label="Файл проекта">
  <div class="panel-head"><h2>{{t('Файл проекта','Project file')}}</h2></div>
  <component :is="DocumentFiles" kind="project" :document="project" :capabilities="caps" @import="openFile"/>
  <p class="project-note">{{t('Файл содержит весь проект: экраны, общие стили и настройки запуска.','The file contains the whole project: screens, shared styles and startup settings.')}}</p>
 </section>
</div></template>
<style>
.project-page {display:flex;flex-direction:column;gap:var(--gap);font-size:var(--editor-font-size);min-width:0;}
.project-page>.panel {flex-shrink:0;}
.project-fields {display:grid;grid-template-columns:140px minmax(180px,600px);align-items:center;gap:3px 8px;}
.project-fields>label,.project-fields>span:first-child {color:var(--lu-text-muted);}
.project-fields input,.project-fields select,.project-actions select,.project-page .document-files select {padding:0 4px;height:var(--editor-control-height);min-height:var(--editor-control-height);line-height:normal;}
.project-contents {display:flex;align-items:center;gap:16px;}
.project-actions {display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
.project-storage-summary {margin-left:6px;color:var(--lu-text-muted);}
.project-result {margin-bottom:5px;color:var(--lu-text);}
.project-note {margin:3px 0 0;font-size:var(--editor-small-font-size);color:var(--lu-text-muted);}
.project-note.bad {color:var(--lu-danger);}
.project-device-details {display:grid;grid-template-columns:140px minmax(180px,1fr);align-items:baseline;gap:3px 8px;margin:0 0 5px;}
.project-device-details dt {color:var(--lu-text-muted);}
.project-device-details dd {margin:0;min-width:0;text-align:left;}
.project-device-details dd>code:not(:only-child) {margin-left:10px;color:var(--lu-text-muted);}
.project-table-scroll {overflow-x:auto;overscroll-behavior:contain;margin-bottom:5px;}
.project-storage-table {border-collapse:collapse;white-space:nowrap;font-size:inherit;}
.project-storage-table th,.project-storage-table td {padding:1px 16px 1px 0;text-align:left;vertical-align:baseline;border-bottom:1px solid var(--lu-border);font-weight:normal;}
.project-storage-table thead th {color:var(--lu-text-muted);}
.project-capabilities dd {overflow-wrap:anywhere;}
.project-device-more {margin:4px 0 0;}
.project-device-more>summary {cursor:pointer;padding:2px 0;color:var(--lu-text);}
.project-device-more[open]>summary {margin-bottom:4px;}
</style>
