<script setup>
import {computed} from 'vue';
import {screenViews} from '@lvgl-cbor/screen-codec';
const props=defineProps({modelValue:Object,screen:Object,label:String}),emit=defineEmits(['update:modelValue']);
const views=computed(()=>screenViews(props.screen)),current=computed(()=>views.value.find(view=>view.node===props.modelValue.view));
function target(id){const view=views.value.find(view=>view.node===id);emit('update:modelValue',{view:id,screen:view?.initial??''});}
</script>
<template><div class="binding-action-target"><label>Контейнер</label><select :aria-label="label+' контейнер'" :value="modelValue.view" @change="target($event.target.value)"><option v-if="!current" :value="modelValue.view">{{modelValue.view||'Выберите контейнер…'}}</option><option v-for="view in views" :key="view.node" :value="view.node">{{view.node}}</option></select><label>Страница</label><select :aria-label="label+' страница'" :value="modelValue.screen" @change="emit('update:modelValue',{...modelValue,screen:$event.target.value})"><option v-if="!current?.pages.some(page=>page.screen===modelValue.screen)" :value="modelValue.screen">{{modelValue.screen}}</option><option v-for="page in current?.pages??[]" :key="page.screen" :value="page.screen">{{page.screen}}</option></select></div></template>
