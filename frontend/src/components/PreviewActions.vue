<script setup>
import {computed} from 'vue';
import {t} from '../state/appearance';
import Icon from './Icon.vue';
const props=defineProps({canApply:Boolean,busy:Boolean,auto:Boolean,simulated:Boolean,message:{type:String,default:''}});
const emit=defineEmits(['apply','check','update:auto']);
const applyLabel=computed(()=>props.busy?t('Отправляется…','Sending…'):props.simulated?t('Проверить в эмуляторе','Validate in simulator'):t('Посмотреть на МК','Preview on device'));
const autoLabel=computed(()=>t('Автоприменение: ','Auto apply: ')+(props.auto?t('включено','on'):t('выключено','off')));
</script>
<template>
 <div class="preview-actions">
  <button class="action-button primary" :disabled="!canApply||busy" :aria-label="applyLabel" :data-tooltip="applyLabel+'\n'+t('Показать черновик на дисплее. Сохранённый проект не меняется.','Show the draft on the display. The saved project stays unchanged.')" @click="emit('apply')"><Icon :name="busy?'hourglass':'device-desktop'"/>{{applyLabel}}</button>
  <button class="preview-icon-button" :class="{selected:auto}" role="switch" :aria-checked="auto" :aria-label="t('Автоприменение','Auto apply')" :data-tooltip="autoLabel+'\n'+t('Применять изменения сразу. Во время обработки пакета правки объединяются; после подтверждения отправляется последнее состояние.','Apply changes immediately. Edits made during a pending request are combined; the latest state is sent after acknowledgement.')" @click="emit('update:auto',!auto)"><Icon name="bolt"/></button>
  <button class="preview-icon-button" :aria-label="t('Проверить','Validate')" :data-tooltip="t('Проверить CBOR без применения на устройстве','Validate CBOR without applying to the device')" @click="emit('check')"><Icon name="list-check"/></button>
  <p v-if="message" role="status" :data-tooltip="message">{{message}}</p>
 </div>
</template>
