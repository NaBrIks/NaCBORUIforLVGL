<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {t} from '../state/appearance';
import {contract} from '@lvgl-cbor/style-codec';
import DisplaySettings from './DisplaySettings.vue';
defineProps(['info','httpOnline','sameContract','origin']);
</script>
<template><section class="panel"><div class="panel-head"><h2>{{t('Устройство','Device')}}</h2></div><dl class="details"><div><dt>{{t('Устройство','Device')}}</dt><dd>{{info?.board??info?.name??'—'}}</dd></div><div><dt>IP</dt><dd>{{info?.ip??'—'}}</dd></div><div><dt>ESP-IDF</dt><dd>{{info?.idf??'—'}}</dd></div><div><dt>LVGL</dt><dd>{{info?.lvgl??'—'}}</dd></div><div><dt>Uptime</dt><dd>{{httpOnline&&Number.isFinite(info?.uptime_ms)?Math.floor(info.uptime_ms/1000)+' s':'—'}}</dd></div><div><dt>{{t('Контракт стилей','Style contract')}}</dt><dd :class="httpOnline?(sameContract?'ok':'bad'):''">{{httpOnline?(sameContract?t('Совпадает','Matches')+' · v'+contract.version:t('НЕ СОВПАДАЕТ','MISMATCH')):'—'}}</dd></div><div><dt>WS RX / {{t('Применено','Applied')}}</dt><dd>{{info?.received??'—'}} / {{info?.applied??'—'}}</dd></div></dl><p v-if="!httpOnline">{{t('Без платы доступно локальное преобразование JSON ↔ CBOR на странице стилей. Измерения не имитируются.','Without a board, local JSON ↔ CBOR conversion is available on the styles page. Measurements are not simulated.')}}</p></section><DisplaySettings v-if="info?.display_config && origin" :origin="origin" :boot-id="info.boot_id"/></template>
