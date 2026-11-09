<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {defineAsyncComponent,onBeforeUnmount,onMounted,ref} from 'vue';
import NativeViewer from './components/NativeViewer.vue';
import {applicationMode} from './state/app-route.js';
const EditorApp=defineAsyncComponent(()=>import('./components/EditorApp.vue'));
const locationRoute={pathname:location.pathname,search:location.search};
const mode=ref(applicationMode(locationRoute));
let disposed=false,controller;
onMounted(async()=>{
 if(mode.value!=='loading')return;
 controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),3000);let profile=null;
 try{const response=await fetch('/api/info',{cache:'no-store',signal:controller.signal});if(response.ok)profile=(await response.json()).profile??null;}catch{}
 finally{clearTimeout(deadline);}
 if(!disposed)mode.value=applicationMode({...locationRoute,profile});
});
onBeforeUnmount(()=>{disposed=true;controller?.abort();});
</script>
<template><NativeViewer v-if="mode==='viewer'"/><EditorApp v-else-if="mode==='editor'"/><main v-else class="app-start"><strong>NaCBORUIforLVGL</strong></main></template>
<style scoped>.app-start{height:100dvh;padding:8px;background:var(--lu-bg-canvas);color:var(--lu-text);}</style>

