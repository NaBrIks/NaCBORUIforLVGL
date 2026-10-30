<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,inject,ref} from 'vue';
import Icon from './Icon.vue';
const props=defineProps({modelValue:{type:Array,default:()=>[]},screenStyles:{type:Array,default:()=>[]}}),emit=defineEmits(['update:modelValue']);
const project=inject('lvgl-project',null),selected=ref('');
const choices=computed(()=>[...Object.keys(project?.workspace.project.value.styles??{}).map(name=>'global:'+name),...props.screenStyles.map(name=>'screen:'+name)]);
function add(){if(selected.value)emit('update:modelValue',[...props.modelValue,{ref:selected.value}]);}
</script>
<template><div v-if="choices.length||modelValue.length" class="project-style-uses" aria-label="Именованные стили компонента"><div class="project-style-use-add"><span>Именованные стили</span><select v-model="selected" aria-label="Добавляемый именованный стиль"><option value="">Выберите стиль…</option><option v-for="name in choices" :key="name" :value="name">{{name}}</option></select><button class="action-button icon-action" :disabled="!selected" aria-label="Прикрепить именованный стиль" data-tooltip="Прикрепить выбранный именованный стиль" @click="add"><Icon name="plus"/></button></div><div v-for="(use,index) in modelValue" :key="index" class="project-style-use"><code>{{use.ref}}</code><span :data-tooltip="JSON.stringify(use)">{{use.part??'MAIN'}}{{use.state?.length?' · '+use.state.join('|'):''}}</span><button class="action-button icon-action" :aria-label="'Убрать стиль '+use.ref" data-tooltip="Снять именованный стиль с компонента" @click="emit('update:modelValue',modelValue.filter((_,i)=>i!==index))"><Icon name="x"/></button></div></div></template>
<style>
.project-style-uses {margin:3px 0;font-size:var(--editor-font-size);}
.project-style-use-add {display:flex;align-items:center;gap:3px;}
.project-style-use-add select {flex:1;min-width:0;}
.project-style-use {display:grid;grid-template-columns:minmax(0,1fr) auto 28px;gap:4px;align-items:center;min-height:var(--editor-row-height);}
.project-style-use code {overflow:hidden;text-overflow:ellipsis;}
.project-style-use span {font-size:var(--editor-small-font-size);color:var(--lu-text-muted);}
</style>
