<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
const props=defineProps({tasks:{type:Array,default:()=>[]},online:Boolean,language:{type:String,default:'ru'}});
const t=(ru,en)=>props.language==='ru'?ru:en;
const sorted=computed(()=>[...props.tasks].sort((a,b)=>Number(b.name.startsWith('IDLE'))-Number(a.name.startsWith('IDLE'))||a.name.localeCompare(b.name)));
</script>
<template><aside class="lab-tasks panel" aria-label="Задачи устройства"><div class="panel-head"><h2>{{t('Задачи','Tasks')}}</h2><span>{{online?tasks.length:'—'}}</span></div><div class="table-wrap"><table><thead><tr><th>{{t('Задача','Task')}}</th><th>Core</th><th>Prio</th><th>{{t('Состояние','State')}}</th><th class="numeric">Stack free B</th></tr></thead><tbody><tr v-if="!online"><td colspan="5">{{t('Нет свежих данных','No fresh data')}}</td></tr><tr v-for="task in online?sorted:[]" :key="task.name+task.id"><td>{{task.name}}</td><td class="numeric">{{task.core===0||task.core===1?task.core:'—'}}</td><td class="numeric">{{task.priority}}</td><td>{{task.state}}</td><td class="numeric">{{task.stack_free}}</td></tr></tbody></table></div></aside></template>
