<script setup>
import NativeMethodField from './NativeMethodField.vue';
import './native-widgets.css';
defineProps({family:{type:Object,required:true},values:{type:Object,default:()=>({})}});
const emit=defineEmits(['set']);
</script>
<template><div class="native-properties">
 <div class="native-family"><strong :title="family.description">{{family.title??family.name}}</strong><code>#{{family.id}} / {{family.abi}}</code></div>
 <NativeMethodField v-for="method in family.methods.filter(m=>!m.retired)" :key="method.opcode" :family="family" :method="method" :model-value="values[method.alias]" @update:model-value="emit('set',method.alias,$event)"/>
</div></template>
