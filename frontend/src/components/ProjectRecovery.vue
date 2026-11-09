<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {ref} from 'vue';
import {ProjectClient} from '../../../packages/project-codec/client.js';
import {showProjectHome,restoreProjectBase} from '../state/project-recovery.js';
import {t} from '../state/appearance';
import Icon from './Icon.vue';
const props=defineProps({mode:{type:String,default:'show'},disabled:{type:Boolean,default:false}});
const client=new ProjectClient(()=>location.origin),busy=ref(false),message=ref(''),failed=ref(false),confirmation=ref(),revision=ref('');
async function run(operation){if(busy.value||props.disabled)return;busy.value=true;failed.value=false;message.value='';try{await operation();}catch(error){failed.value=true;message.value=error.message;}finally{busy.value=false;}}
function show(){void run(async()=>{const entry=await showProjectHome(client);message.value=t('Показана главная страница: ','Main page shown: ')+entry;});}
function ask(){void run(async()=>{const info=await client.info();if(!info?.storage?.writable)throw Error(t('Сохранённый проект доступен только для чтения','The saved project is read-only'));revision.value=info.project.revision;confirmation.value.showModal();});}
function restore(){confirmation.value.close();void run(async()=>{const entry=await restoreProjectBase(client,revision.value);message.value=t('Исходная раскладка восстановлена: ','Original layout restored: ')+entry;});}
</script>
<template><div class="project-recovery" :class="mode"><button v-if="mode==='show'" class="icon-button" :class="{bad:failed}" :disabled="disabled||busy" :aria-label="t('Показать главную страницу проекта','Show the project home page')" :data-tooltip="message||t('Показать главную страницу проекта. Сохранённые изменения остаются.','Show the project home page. Saved changes are kept.')" @click="show"><Icon name="home"/></button><template v-else><button class="action-button" :disabled="disabled||busy" @click="ask">{{t('Восстановить исходную раскладку','Restore original layout')}}</button><div class="project-recovery-message" :class="failed?'bad':'muted'">{{message}}</div><dialog ref="confirmation" class="project-recovery-confirm"><h2>{{t('Восстановить исходную раскладку?','Restore the original layout?')}}</h2><p>{{t('Все сохранённые изменения проекта будут удалены. Будет показана главная страница исходного проекта.','All saved project changes will be discarded. The original project home page will be shown.')}}</p><form method="dialog"><button class="action-button">{{t('Отмена','Cancel')}}</button><button class="action-button primary" type="button" @click="restore">{{t('Восстановить','Restore')}}</button></form></dialog></template></div></template>
<style scoped>
.project-recovery.show{display:flex;align-items:center;}.project-recovery.show .icon-button{width:30px;height:30px;}.project-recovery.base{margin-top:10px;padding-top:8px;border-top:1px solid var(--lu-border);}.project-recovery-message{height:40px;line-height:20px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;}.project-recovery-confirm{max-width:min(480px,calc(100vw - 32px));padding:12px;border:1px solid var(--lu-border);background:var(--lu-surface);color:var(--lu-text);}.project-recovery-confirm h2{font-size:16px;margin:0 0 8px;}.project-recovery-confirm p{line-height:1.4;}.project-recovery-confirm form{display:flex;justify-content:flex-end;gap:8px;}
</style>
