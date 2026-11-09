<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {nextTick,ref,watch} from 'vue';
import {t} from '../state/appearance';
const props=defineProps({records:{type:Array,required:true},active:{type:Boolean,default:true}});
const viewport=ref(),following=ref(true);
function elapsed(value){const milliseconds=Math.max(0,Number(value)||0);return String(Math.floor(milliseconds/60000)).padStart(2,'0')+':'+String(Math.floor(milliseconds/1000)%60).padStart(2,'0')+'.'+String(milliseconds%1000).padStart(3,'0');}
function kind(value){return ({stage:t('Этап','Stage'),phase:t('Этап','Stage'),tool:t('Инструмент','Tool'),result:t('Результат','Result'),error:t('Ошибка','Error'),request:t('Запрос','Request'),answer:t('Ответ','Answer'),done:t('Готово','Done')})[value]||value;}
function scroll(){const element=viewport.value;if(element&&props.active)following.value=element.scrollHeight-element.scrollTop-element.clientHeight<=20;}
watch([()=>props.records,()=>props.active],async()=>{const follow=following.value;await nextTick();if(props.active&&follow&&viewport.value)viewport.value.scrollTop=viewport.value.scrollHeight;},{immediate:true});
</script>
<template><div ref="viewport" class="assistant-log" tabindex="0" :aria-label="t('Журнал работы ассистента','Assistant activity log')" @scroll.passive="scroll"><table><thead><tr><th class="assistant-log-time">{{t('Время','Time')}}</th><th class="assistant-log-kind">{{t('Этап','Step')}}</th><th>{{t('Действие и результат','Action and result')}}</th></tr></thead><tbody><tr v-for="record in records" :key="record.seq" :class="record.kind==='error'?'bad':''"><td class="assistant-log-time">{{elapsed(record.elapsed_ms)}}</td><td class="assistant-log-kind">{{kind(record.kind)}}</td><td class="assistant-log-text">{{record.text}}</td></tr><tr v-if="!records.length"><td colspan="3" class="muted">{{t('После отправки здесь появятся шаги ассистента.','Assistant steps appear here after sending a request.')}}</td></tr></tbody></table></div></template>
<style scoped>
.assistant-log{height:100%;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;background:var(--lu-surface);color:var(--lu-text);}.assistant-log table{width:100%;border-collapse:collapse;table-layout:fixed;}.assistant-log th,.assistant-log td{text-align:left;vertical-align:top;padding:4px 8px;border-bottom:1px solid var(--lu-border);line-height:18px;}.assistant-log thead{position:sticky;top:0;background:var(--lu-surface-alt);z-index:1;}.assistant-log .assistant-log-time{width:11ch;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}.assistant-log .assistant-log-kind{width:15ch;white-space:normal;overflow-wrap:anywhere;}.assistant-log-text{white-space:pre-wrap;overflow-wrap:anywhere;}
</style>
