<script setup>
defineProps(['hex','decoded','reply']);
</script>
<template><details class="panel transport-details"><summary>Передаваемый пакет и ответ МК</summary><details><summary>CBOR HEX</summary><pre>{{hex||'—'}}</pre></details><details><summary>CBOR → JSON</summary><pre>{{decoded||'—'}}</pre></details><details v-if="reply" open><summary>Подтверждение МК</summary><pre>{{reply}}</pre></details></details></template>
