<script setup>
import {t} from '../state/appearance';
defineProps({values:{type:Object,required:true}});
const metrics=[['X','x'],['Y','y'],['W','width'],['H','height'],['Border','border_width'],['Кадр','frame_count']];
const colors=['bg_color','text_color','border_color'];
const number=value=>Number.isFinite(value)?value:'—';
const color=value=>Number.isInteger(value)&&value>=0&&value<=0xffffff?'#'+value.toString(16).padStart(6,'0'):null;
</script>
<template><section class="observed-style" :aria-label="t('Прочитано с МК после отрисовки','Device readback after rendering')">
 <h3>{{t('Прочитано с МК после отрисовки','Device readback after rendering')}}</h3>
 <div class="observed-values-scroll"><table class="observed-values">
  <colgroup><col span="5"><col class="observed-frame-column"></colgroup>
  <thead><tr><th v-for="[label,key] in metrics" :key="key" scope="col" class="numeric">{{key==='frame_count'?t('Кадр','Frame'):label}}</th></tr></thead>
  <tbody><tr><td v-for="[,key] in metrics" :key="key" class="numeric">{{number(values[key])}}</td></tr></tbody>
 </table></div>
 <table class="readback-colors" :aria-label="t('Прочитанные цвета','Readback colors')"><tbody>
  <tr v-for="name in colors" :key="name"><th scope="row">{{name}}</th><td class="readback-swatch"><i :style="{background:color(values[name])??'transparent'}" aria-hidden="true"/></td><td><code>{{color(values[name])??'—'}}</code></td></tr>
 </tbody></table>
</section></template>
