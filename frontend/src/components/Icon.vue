<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup lang="ts">
import helpCircle from '../design/icons/help-circle.svg?raw';
import infoCircle from '../design/icons/info-circle.svg?raw';
import deviceDesktop from '../design/icons/device-desktop.svg?raw';
import home from '../design/icons/home.svg?raw';
defineProps<{name:string}>();
const svgIcons:Record<string,string>={'info-circle':infoCircle,'help-circle':helpCircle,'device-desktop':deviceDesktop,home};
</script>
<template><i v-if="svgIcons[name]" class="svg-icon" aria-hidden="true" v-html="svgIcons[name]"></i><i v-else :class="['ti','ti-'+name]" aria-hidden="true"></i></template>
