<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {t} from '../state/appearance';
import DeviceRuntimeInfo from './DeviceRuntimeInfo.vue';
import Icon from './Icon.vue';
defineProps(['simulated','device','info','httpOnline']);
const emit=defineEmits(['update:device','connect']);
const bytes=value=>Number.isFinite(value)?new Intl.NumberFormat().format(value)+' B':'—';
</script>
<template><div class="metrics"><span v-if="simulated" :data-tooltip="t('Тестовые данные; LVGL не исполняется','Test data; LVGL is not executed')">Эмулятор сайта</span><label v-else><input :value="device" @input="emit('update:device',$event.target.value)" placeholder="http://192.168.x.x" aria-label="Device URL"></label><button v-if="!simulated" class="icon-button" :aria-label="t('Подключить','Connect')" :data-tooltip="t('Получить возможности платы. Подключение не отправляет документ на МК.','Read device capabilities. Connecting does not send a document to the MCU.')" @click="emit('connect')"><Icon name="plug"/></button><span>LVGL <b>{{info?.lvgl??'—'}}</b></span><span>RAM <b>{{httpOnline?bytes(info?.heap_free):'—'}}</b></span><span>PSRAM <b>{{httpOnline?bytes(info?.psram_free):'—'}}</b></span><DeviceRuntimeInfo :simulated="simulated" :info="info" :http-online="httpOnline"/></div></template>
