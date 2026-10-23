<script setup>
import {inject} from 'vue';
const {pagePreview}=inject('lvgl-project');
const {target,targets}=pagePreview;
</script>
<template><select v-model="target" aria-label="Место просмотра страницы" data-tooltip="Режим общего предпросмотра в браузере и на МК; изменение режима ничего не отправляет"><option v-for="item in targets" :key="item.key" :value="item.key">{{item.label}}</option></select></template>
<style scoped>select {max-width:360px;}</style>
