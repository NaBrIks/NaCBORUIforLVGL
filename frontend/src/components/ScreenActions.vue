<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {t} from '../state/appearance';
import Icon from './Icon.vue';
defineProps({screen:{type:Object,required:true},canRemove:Boolean});
const emit=defineEmits(['open','duplicate','remove']);
</script>
<template><div class="screen-row-actions">
 <button class="action-button" :aria-label="t('Редактировать ','Edit ')+screen.name" @click.stop="emit('open',screen.id)">{{t('Редактор','Edit')}}</button>
 <button class="action-button icon-action" :aria-label="t('Копировать ','Duplicate ')+screen.name" :data-tooltip="t('Создать независимую копию экрана','Create an independent screen copy')" @click.stop="emit('duplicate',screen.id)"><Icon name="clipboard"/></button>
 <button class="action-button icon-action" :aria-label="t('Удалить ','Delete ')+screen.name" :data-tooltip="!canRemove?t('Последний экран остаётся','Keep at least one screen'):t('Удалить экран; последнее удаление можно отменить','Delete screen; the last deletion can be undone')" :disabled="!canRemove" @click.stop="emit('remove',screen.id)"><Icon name="trash"/></button>
</div></template>
