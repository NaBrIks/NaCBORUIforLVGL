<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {t} from '../state/appearance';
defineProps({items:{type:Array,required:true}});
defineEmits(['remove']);
</script>
<template><div v-if="items.length" class="assistant-attachments" :aria-label="t('Вложения','Attachments')"><figure v-for="(image,index) in items" :key="image.dataUrl"><span v-if="image.mime==='application/json'" class="json-file">JSON · {{image.name}}</span><img v-else :src="image.dataUrl" :alt="image.name"><figcaption :data-tooltip="image.name+' · '+image.width+' × '+image.height">{{index+1}}</figcaption><button type="button" class="icon-button" :aria-label="t('Удалить вложение ','Remove attachment ')+(index+1)" @click="$emit('remove',index)">×</button></figure></div></template>
<style scoped>
.assistant-attachments{display:flex;flex:none;gap:6px;max-width:100%;overflow:auto;}.assistant-attachments figure{display:flex;align-items:center;gap:3px;flex:none;margin:0;height:54px;}.assistant-attachments img{width:64px;height:48px;object-fit:contain;background:var(--lu-surface-alt);}.assistant-attachments figcaption{font-variant-numeric:tabular-nums;}
</style>
