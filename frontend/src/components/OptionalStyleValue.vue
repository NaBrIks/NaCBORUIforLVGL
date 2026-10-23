<script setup>
import StyleValue from './StyleValue.vue';
defineProps({method:Object,modelValue:{default:undefined},resources:{type:Array,default:()=>[]}});
const emit=defineEmits(['update:modelValue']);
</script>
<template><StyleValue nullable :method="method" :model-value="modelValue" :resources="resources" @update:model-value="emit('update:modelValue',$event)"/></template>
