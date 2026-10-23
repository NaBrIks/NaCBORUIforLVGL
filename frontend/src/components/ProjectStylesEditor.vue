<script setup>
import {computed,inject,ref} from 'vue';
import Icon from './Icon.vue';
import ContextMenu from './ContextMenu.vue';
import VisualStyleEditor from './VisualStyleEditor.vue';
import StyleDiagnostics from './StyleDiagnostics.vue';
import {t} from '../state/appearance';
defineProps(['observed','resources','canApply','autoApply','hex','decoded','reply']);
const emit=defineEmits(['apply']);
const {workspace}=inject('lvgl-project'),{project,styleId,styleDoc,styleUses,warning}=workspace,context=ref(null);
function openContext(event,name){event.preventDefault();event.stopPropagation();event.currentTarget.focus();if(name)styleId.value=name;const rect=event.currentTarget.getBoundingClientRect();context.value={name,x:event.clientX||rect.left+12,y:event.clientY||rect.top+20};}
const items=computed(()=>[{label:t('Добавить стиль','Add style'),icon:'plus',action:'add'},...(context.value?.name?[{label:t('Копировать стиль','Duplicate style'),icon:'clipboard',action:'copy'},{label:t('Удалить стиль','Delete style'),icon:'trash',action:'remove',disabled:!!styleUses.value[context.value.name],hint:styleUses.value[context.value.name]?t('Стиль используется в проекте. Сначала снимите ссылки.','The style is in use. Remove its references first.'):t('Удалить именованный стиль','Delete named style')}]:[])]);
function command(item){if(item.action==='add')workspace.addStyle();else if(item.action==='copy')workspace.duplicateStyle(context.value.name);else workspace.removeStyle(context.value.name);}
</script>
<template><div class="project-styles-editor">
 <section class="panel project-styles-list" aria-label="Список стилей проекта">
  <div class="panel-head"><h2>{{t('Стили проекта','Project styles')}}</h2><button class="action-button icon-action primary" aria-label="Добавить стиль проекта" :data-tooltip="t('Создать общий именованный стиль','Create shared named style')" @click="workspace.addStyle()"><Icon name="plus"/></button></div>
  <div class="project-styles-items" role="listbox" aria-label="Стили проекта" tabindex="0" @contextmenu.self="openContext($event,null)"><button v-for="style in project.styles" :key="style.name" role="option" :aria-selected="style.name===styleId" :class="{selected:style.name===styleId}" :data-tooltip="style.name" @click="styleId=style.name" @contextmenu="openContext($event,style.name)" @keydown.shift.f10.prevent="openContext($event,style.name)"><Icon name="palette"/><span>{{style.name}}</span></button><p v-if="!Object.keys(project.styles).length" class="project-note">{{t('Добавьте первый стиль кнопкой + или через ПКМ.','Add the first style using + or the context menu.')}}</p></div>
  <div class="screen-toolbar"><button class="action-button icon-action" :disabled="!styleId" aria-label="Копировать стиль" :data-tooltip="t('Создать независимую копию выбранного стиля','Create an independent copy of the selected style')" @click="workspace.duplicateStyle()"><Icon name="clipboard"/></button><button class="action-button icon-action" :disabled="!styleId||!!styleUses[styleId]" aria-label="Удалить стиль" :data-tooltip="styleUses[styleId]?t('Стиль используется в проекте. Сначала снимите ссылки.','The style is in use. Remove its references first.'):t('Удалить выбранный стиль','Delete selected style')" @click="workspace.removeStyle()"><Icon name="trash"/></button></div>
 </section>
 <div class="project-style-properties">
  <p v-if="warning" class="bad" role="alert">{{warning}}</p>
  <VisualStyleEditor v-if="styleId&&project.styles[styleId]" project-mode :model-value="styleDoc" :observed="observed" :resources="resources" :can-apply="canApply" :auto-apply="autoApply" @update:modelValue="workspace.styleDoc.value=$event" @apply="emit('apply')"/>
  <div v-else class="panel project-note">{{t('Выберите или создайте стиль слева.','Select or create a style on the left.')}}</div>
  <StyleDiagnostics :hex="hex" :decoded="decoded" :reply="reply"/>
 </div>
 <ContextMenu v-if="context" :x="context.x" :y="context.y" :items="items" label="Действия со стилем" @select="command" @close="context=null"/>
</div></template>
<style>
.lab-main.styles-main {overflow:hidden;}
.project-styles-editor {display:grid;grid-template-columns:170px minmax(0,1fr);gap:var(--gap);flex:1;min-width:0;min-height:0;font-size:var(--editor-font-size);}
.project-styles-list {display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.project-styles-list .panel-head {flex-shrink:0;}
.project-styles-items {flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;}
.project-styles-items>button {display:flex;align-items:center;gap:5px;width:100%;min-height:var(--editor-row-height);padding:1px 4px;text-align:left;}
.project-styles-items>button.selected {background:var(--lu-primary-light);}
.project-styles-items>button>span {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.project-style-properties {min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:var(--gap);}
.project-style-properties>.style-editor {flex-shrink:0;}
</style>
