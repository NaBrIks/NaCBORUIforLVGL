<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {t} from '../state/appearance';
import VirtualScreen from './VirtualScreen.vue';
import {useScreenPreviewSettings} from '../state/screen-preview-settings.js';
const props=defineProps({screen:{type:Object,required:true}});
const {showHidden}=useScreenPreviewSettings(()=>props.screen.id);
const emit=defineEmits(['open']);
</script>
<template><div class="screen-thumbnail">
 <VirtualScreen :screen="screen" :width="screen.size.width" :height="screen.size.height" :padding="6" :show-scale="false" :show-hidden="showHidden" aria-hidden="true"/>
 <button class="screen-thumbnail-open" :aria-label="t('Открыть предпросмотр в редакторе: ','Open preview in editor: ')+screen.name" :data-tooltip="t('Открыть редактор экрана','Open screen editor')" @click.stop="emit('open',screen.id)"></button>
</div></template>
