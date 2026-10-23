<script setup>
import {computed,inject} from 'vue';
import {t} from '../state/appearance';
import Icon from './Icon.vue';
const {controller}=inject('lvgl-project');
const {available,projectBusy,projectMessage}=controller;
const tooltip=computed(()=>[t('Показать сохранённый главный экран МК. Проект и локальные правки не меняются.','Show the saved MCU startup screen. Project and local edits stay unchanged.'),projectMessage.value].filter(Boolean).join('\n'));
</script>
<template><button class="action-button primary icon-action project-home-button" :disabled="!available||projectBusy" :aria-label="t('Главный экран МК','MCU home screen')" :data-tooltip="tooltip" @click="controller.showSaved()"><Icon name="home"/></button></template>
<style scoped>
.project-home-button>.svg-icon {width:22px;height:22px;}
</style>
