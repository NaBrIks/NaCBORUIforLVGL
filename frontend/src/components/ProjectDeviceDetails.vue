<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,inject} from 'vue';
import {widgetCatalog} from '@lvgl-cbor/screen-codec';
import {t} from '../state/appearance';
const props=defineProps(['status']);
const capabilities=inject('lvgl-capabilities');
const families=computed(()=>capabilities.value?widgetCatalog(capabilities.value).filter(item=>capabilities.value.availableWidgets.includes(item.id)):[]);
const permissions=computed(()=>Object.entries(props.status.policy).filter(([,enabled])=>enabled).map(([key])=>({replace:t('изменение существующих','edit existing'),add:t('добавление','add'),remove:t('удаление','remove')})[key]).join(', ')||t('только чтение','read only'));
const rows=computed(()=>[
 {role:t('База','Base'),...props.status.base},
 {role:t('Изменения','Changes'),...(props.status.changes??{kind:t('не подключены','not connected'),state:'not-configured'})}
]);
const stateLabel=state=>({'available':t('доступно','available'),'not-configured':t('не настроено','not configured'),'unavailable':t('недоступно','unavailable'),'unknown':t('неизвестно','unknown')})[state]??state??t('неизвестно','unknown');
const persistence=row=>row.persistent===undefined?'—':row.persistent?t('постоянно','persistent'):t('до перезапуска','until restart');
const access=row=>row.writable===undefined?'—':row.writable?t('чтение и запись','read and write'):t('чтение','read');
</script>
<template>
 <dl class="project-device-details">
  <dt>{{t('Сохранённый проект','Saved project')}}</dt><dd>{{status.project.name}} <code>{{status.project.id}}</code></dd>
  <dt>{{t('Разрешено на МК','Allowed on MCU')}}</dt><dd>{{permissions}}</dd>
  <dt>{{t('Сохранённая версия','Saved revision')}}</dt><dd><code>{{status.project.revision}}</code> · {{status.project.changed?t('есть изменения базы','base has changes'):t('исходная база','original base')}}</dd>
  <template v-if="status.display?.screen"><dt>{{t('Показан сервисом','Shown by service')}}</dt><dd>{{status.display.screen}} · {{status.display.preview?t('предпросмотр черновика','draft preview'):t('сохранённый экран','saved screen')}}</dd></template>
 </dl>
 <div class="project-table-scroll"><table class="project-storage-table" aria-label="Хранение проекта">
  <thead><tr><th>{{t('Часть проекта','Project part')}}</th><th>{{t('Носитель','Medium')}}</th><th>{{t('Расположение','Location')}}</th><th>{{t('Хранение','Retention')}}</th><th>{{t('Доступ','Access')}}</th><th>{{t('Состояние','State')}}</th></tr></thead>
  <tbody><tr v-for="row in rows" :key="row.role"><th>{{row.role}}</th><td>{{row.kind||'—'}}</td><td><code>{{row.location||'—'}}</code></td><td>{{persistence(row)}}</td><td>{{access(row)}}</td><td>{{stateLabel(row.state)}}</td></tr></tbody>
 </table></div>
 <details v-if="status.catalog?.documents?.length" class="project-device-more"><summary>{{t('Каталог экранов и стилей МК','MCU screen and style catalog')}} · {{status.catalog.documents.length}}</summary>
 <div class="project-table-scroll"><table class="project-storage-table" aria-label="Каталог документов проекта МК">
  <thead><tr><th>{{t('Тип','Type')}}</th><th>{{t('Имя','Name')}}</th><th>{{t('Источник','Origin')}}</th><th>{{t('Расположение','Location')}}</th><th>B</th></tr></thead>
  <tbody><tr v-for="doc in status.catalog.documents" :key="doc.kind+':'+doc.name"><td>{{doc.kind==='screens'?t('Экран','Screen'):t('Стиль','Style')}}</td><th>{{doc.name}}</th><td>{{doc.origin==='base'?t('База прошивки','Firmware base'):t('Слой изменений','Changes layer')}}</td><td><code>{{doc.location||'—'}}</code></td><td>{{doc.bytes}}</td></tr></tbody>
 </table></div>
 </details>
 <details class="project-device-more"><summary>{{t('Носители и возможности МК','MCU media and capabilities')}}<span v-if="families.length"> · {{families.length}} {{t('компонентов','components')}} · {{t('проект до','project up to')}} {{status.maxBytes}} B</span></summary>
 <div v-if="status.media?.length" class="project-table-scroll"><table class="project-storage-table" aria-label="Носители, объявленные прошивкой">
  <thead><tr><th>{{t('Носители прошивки','Firmware media')}}</th><th>{{t('Состояние','State')}}</th><th>{{t('Расположение','Location')}}</th><th>{{t('Хранение','Retention')}}</th><th>{{t('Доступ','Access')}}</th></tr></thead>
  <tbody><tr v-for="(row,index) in status.media" :key="index"><th>{{row.kind}}</th><td>{{stateLabel(row.state)}}</td><td><code>{{row.location||'—'}}</code></td><td>{{persistence(row)}}</td><td>{{row.state==='available'?access(row):'—'}}</td></tr></tbody>
 </table></div>
 <p v-else class="project-note">{{t('Перечень носителей не объявлен прошивкой.','Firmware does not declare a media inventory.')}}</p>
 <dl v-if="capabilities" class="project-device-details project-capabilities">
  <dt>{{t('Компоненты МК','MCU components')}}</dt><dd>{{families.map(item=>item.title||item.name).join(', ')||'—'}}</dd>
  <dt>{{t('Ресурсы МК','MCU resources')}}</dt><dd>{{capabilities.resources.map(item=>item.name).join(', ')||'—'}}</dd>
  <dt>{{t('Лимиты','Limits')}}</dt><dd>{{t('Проект','Project')}} {{status.maxBytes}} B · {{t('экран','screen')}} {{capabilities.limits.screenPacketBytes}} B · {{t('стиль','style')}} {{capabilities.limits.stylePacketBytes}} B · {{t('узлов','nodes')}} {{capabilities.limits.nodes}} · {{t('глубина','depth')}} {{capabilities.limits.depth}}</dd>
 </dl>
 </details>
 <p v-if="!status.storage.writable" class="project-note">{{t('Прошивка разрешает только чтение проекта. Рабочую копию можно редактировать и сохранять в файл.','Firmware allows reading only. You can edit the working copy and save it to a file.')}}</p>
</template>
