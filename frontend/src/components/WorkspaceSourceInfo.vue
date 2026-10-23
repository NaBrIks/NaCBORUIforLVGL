<script setup>
import {computed,inject} from 'vue';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import {t} from '../state/appearance';
const live=inject('lvgl-capabilities',null),{capabilities,families}=useRuntimeCapabilities();
const nativeCount=computed(()=>families.value.filter(w=>w.abi).length);
const source=computed(()=>live?.value?(live.value.source==='simulator'?t('симулятор','simulator'):t('подключённая плата','connected device')):capabilities?.value?.source==='offline-cache'?t('сохранённый каталог · офлайн','cached catalog · offline'):t('встроенный каталог · офлайн','bundled catalog · offline'));
</script>
<template><div class="workspace-source-info" role="status" :aria-label="t('Источник компонентов','Component source')"><span>{{t('Компоненты: ','Components: ')}}{{source}}<template v-if="nativeCount"> · {{nativeCount}} {{t('пользовательских','native')}}</template></span></div></template>
<style>
.workspace-source-info {display:flex;flex-wrap:wrap;gap:3px 12px;padding:3px 0;color:var(--lu-text-muted);font-size:var(--editor-small-font-size);flex-shrink:0;}
</style>
