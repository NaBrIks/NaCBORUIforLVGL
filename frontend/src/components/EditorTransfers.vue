<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {defineAsyncComponent} from 'vue';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import '../design/transfers.css';
const {capabilities}=useRuntimeCapabilities();
defineProps({kind:{type:String,required:true},document:{type:Object,required:true}});
const emit=defineEmits(['import']);
// Compile-time switches eliminate the imports and chunks from stripped editor builds.
const DocumentFiles=import.meta.env.VITE_LVGL_CBOR_FILES==='false'?null:defineAsyncComponent(()=>import('../modules/document-files/DocumentFiles.vue'));
const CssTransfer=import.meta.env.VITE_LVGL_CBOR_CSS==='false'?null:defineAsyncComponent(()=>import('../modules/css-transfer/CssTransfer.vue'));
</script>
<template><div v-if="DocumentFiles||CssTransfer" class="editor-transfers">
 <component :is="DocumentFiles" v-if="DocumentFiles" :kind="kind" :document="document" :capabilities="capabilities" @import="emit('import',$event)"/>
 <component :is="CssTransfer" v-if="CssTransfer" :kind="kind" :document="document" :capabilities="capabilities" @import="emit('import',$event)"/>
</div></template>
