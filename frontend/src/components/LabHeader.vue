<script setup>
import {computed} from 'vue';
import {appearance,t} from '../state/appearance';
import AppearanceMenu from './AppearanceMenu.vue';
import Icon from './Icon.vue';
import ProjectHomeButton from './ProjectHomeButton.vue';
const props=defineProps(['online','httpOnline','httpError','wsStatus','connectionNote']);
const httpTooltip=computed(()=>props.httpOnline
 ?t('HTTP: данные устройства доступны.','HTTP: device data is available.')
 :[t('HTTP: данные устройства недоступны.','HTTP: device data is unavailable.'),props.httpError].filter(Boolean).join('\n'));
const wsTooltip=computed(()=>{
 const state=props.online?t('соединение установлено.','connected.')
  :props.wsStatus==='retry'?t('ожидание повторного подключения.','waiting to reconnect.')
  :props.wsStatus==='connecting'?t('подключение…','connecting…')
  :t('соединение не установлено.','disconnected.');
 return ['WebSocket: '+state,...(!props.online&&props.connectionNote?[props.connectionNote]:[])].join('\n');
});
</script>
<template><header class="topbar"><button class="icon-button" :aria-label="t('Свернуть меню','Toggle menu')" @click="appearance.collapsed=!appearance.collapsed"><Icon name="menu-2"/></button><strong class="brand">NaCBORUIforLVGL</strong><slot/><ProjectHomeButton/><div class="top-status"><span :class="httpOnline?'ok':'bad'" :data-tooltip="httpTooltip">HTTP {{httpOnline?'online':'offline'}}</span><span :class="online?'ok':'bad'" :data-tooltip="wsTooltip">WS {{online?'online':wsStatus==='retry'?'retry':wsStatus==='connecting'?'connecting':'offline'}}</span></div><div class="appearance-controls"><AppearanceMenu/><button class="language-button" @click="appearance.language=appearance.language==='ru'?'en':'ru'">{{appearance.language.toUpperCase()}}</button></div></header></template>
