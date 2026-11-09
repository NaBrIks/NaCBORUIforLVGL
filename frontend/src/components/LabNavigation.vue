<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {t} from '../state/appearance';
import Icon from './Icon.vue';
defineProps(['page','screens','screenId']);
const emit=defineEmits(['update:page','select-screen']);
</script>
<template><aside class="sidebar"><nav>
<section class="nav-group"><h2 class="nav-group-label">{{t('Редактор','Editor')}}</h2>
<button aria-label="Проект" :class="{active:page==='project'}" @click="emit('update:page','project')"><Icon name="folder"/><span>{{t('Проект','Project')}}</span></button>
<button aria-label="Экраны" :class="{active:page==='screen-manager'}" @click="emit('update:page','screen-manager')"><Icon name="device-desktop"/><span>{{t('Экраны','Screens')}}</span></button>
<button v-for="screen in screens" :key="screen.id" class="screen-menu-item" :aria-label="'Открыть '+screen.name" :data-tooltip="screen.name" :class="{active:page==='screens'&&screenId===screen.id}" @click="emit('select-screen',screen.id)"><Icon name="device-desktop"/><span>{{screen.name}}</span></button>
<button aria-label="Стили" :class="{active:page==='styles'}" @click="emit('update:page','styles')"><Icon name="palette"/><span>{{t('Стили','Styles')}}</span></button></section>
<section class="nav-group"><h2 class="nav-group-label">{{t('Система','System')}}</h2><button aria-label="Устройство" :class="{active:page==='info'}" @click="emit('update:page','info')"><Icon name="list-details"/><span>{{t('Устройство','Device')}}</span></button></section>
<section class="nav-group"><a class="reference-link" href="/reference/widget_api_lvgl_9_6.html" target="_blank" rel="noreferrer" :aria-label="t('Справочник C API LVGL','LVGL C API reference')" :data-tooltip="t('Сгенерированные C-сигнатуры функций LVGL. Это документация библиотеки, а не HTTP API приложения.','Generated LVGL C function signatures. Library documentation, not the application HTTP API.')"><Icon name="book"/><span>{{t('Справочник C API LVGL','LVGL C API reference')}} ↗</span></a></section></nav></aside></template>
