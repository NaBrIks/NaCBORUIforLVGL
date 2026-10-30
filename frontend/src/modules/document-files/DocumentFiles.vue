<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,ref} from 'vue';
import {parseDocument,serializeDocument,documentFilename,maxDocumentBytes} from '@lvgl-cbor/document-io';
import {readBoundedFile,downloadBytes} from '../../transfer/browser-files.js';
import {t} from '../../state/appearance';
import Icon from '../../components/Icon.vue';
const props=defineProps({kind:{type:String,required:true},document:{type:Object,required:true},capabilities:Object});
const emit=defineEmits(['import']);const format=ref('json'),input=ref(null),message=ref(''),failed=ref(false);
const noun=computed(()=>({project:t('проекта','project'),screen:t('экрана','screen'),style:t('стиля','style')})[props.kind]);
const objectName=computed(()=>({project:t('проект','project'),screen:t('экран','screen'),style:t('стиль','style')})[props.kind]);
function save(){try{const bytes=serializeDocument(props.kind,props.document,format.value,{capabilities:props.capabilities});downloadBytes(bytes,documentFilename(props.kind,props.document,format.value),format.value==='json'?'application/json':'application/cbor');failed.value=false;message.value=t('Подготовлен файл: ','File prepared: ')+bytes.length+' B';}catch(e){failed.value=true;message.value=e.message;}}
async function load(event){try{const file=event.target.files[0],bytes=await readBoundedFile(file,maxDocumentBytes),format=/\.json$/i.test(file.name)?'json':/\.(cbor|bin)$/i.test(file.name)?'cbor':undefined;let recompiled=false;const document=parseDocument(props.kind,bytes,{format,capabilities:props.capabilities,onRecompile:()=>recompiled=true});emit('import',document,{filename:file.name,recompiled});failed.value=false;message.value=t('Открыт ','Opened ')+file.name+(recompiled?t(' · перекомпилирован по текущему контракту; совместимость с МК проверяется при применении',' · recompiled with the current contract; device compatibility is checked on apply'):'');}catch(e){failed.value=true;message.value=e.message;}finally{event.target.value='';}}
</script>
<template><div class="document-files" :aria-label="t('Файл ','File: ')+noun">
 <button class="action-button" @click="input.click()" :aria-label="t('Открыть '+objectName+' из файла','Open '+objectName+' from file')" :data-tooltip="t('Открыть JSON или CBOR в редакторе','Open JSON or CBOR in the editor')"><Icon name="folder-open"/>{{t('Открыть файл','Open file')}}</button>
 <span class="document-files-divider"></span>
 <select v-model="format" :aria-label="t('Формат файла '+noun,noun+' file format')"><option value="json">JSON</option><option value="cbor">CBOR</option></select>
 <button class="action-button" @click="save" :aria-label="t('Сохранить '+objectName+' в файл','Save '+objectName+' to file')" :data-tooltip="t('Сохранить рабочую копию в файл','Save the working copy to a file')"><Icon name="device-floppy"/>{{t('Сохранить файл','Save file')}}</button>
 <input ref="input" type="file" accept=".json,.cbor,.bin,application/json,application/cbor" hidden @change="load">
 <span v-if="message" role="status" :class="{bad:failed}">{{message}}</span>
</div></template>
<style>
.document-files {display:flex;align-items:center;gap:var(--gap);flex-wrap:wrap;min-width:0;}
.document-files select {width:75px;}
.document-files-divider {height:16px;border-left:1px solid var(--lu-border);margin:0 5px;}
.document-files [role=status] {overflow-wrap:anywhere;}
</style>
