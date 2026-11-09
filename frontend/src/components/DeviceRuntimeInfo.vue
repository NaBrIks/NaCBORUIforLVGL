<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {screenContract} from '@lvgl-cbor/screen-codec';
import {t} from '../state/appearance';
const props=defineProps(['simulated','info','httpOnline']);
const board=computed(()=>props.simulated?t('CSS-предпросмотр · LVGL не исполняется','CSS preview · LVGL is not executed'):props.httpOnline?props.info?.board??props.info?.name??t('Название устройства не получено','Device name unavailable'):t('Данные платы не получены','No device data received'));
</script>
<template><div class="device-runtime-info">
 <span class="device-board-name" :data-tooltip="board">{{board}}</span>
 <span :data-tooltip="t('Версии контрактов редактора. Совместимость подключённой прошивки проверяется отдельно по её возможностям.','Editor contract versions. Connected firmware compatibility is checked separately using its capabilities.')">CBOR · style ABI v{{contract.version}} · screen ABI v{{screenContract.version}}</span>
</div></template>
