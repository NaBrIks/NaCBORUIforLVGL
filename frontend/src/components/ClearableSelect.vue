<script setup>
import {ref,computed} from 'vue';
defineOptions({inheritAttrs:false});
const props=defineProps({value:{default:''}});
const emit=defineEmits(['change']);
const select=ref(null);
const hasValue=computed(()=>props.value!==''&&props.value!==undefined&&props.value!==null);
function clear(){select.value.value='';select.value.dispatchEvent(new Event('change',{bubbles:true}));select.value.focus();}
</script>
<template>
 <span class="select-editor"><select ref="select" v-bind="$attrs" :value="value" @change="emit('change',$event)"><slot/></select><button v-if="hasValue" type="button" class="field-clear" :aria-label="'Очистить '+($attrs['aria-label']??'значение')" data-tooltip="Не задавать значение" @mousedown.prevent @click="clear">×</button></span>
</template>
