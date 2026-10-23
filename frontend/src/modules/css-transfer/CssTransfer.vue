<script setup>
import {computed,ref} from 'vue';
import {importCss,exportCss} from '@lvgl-cbor/css-codec';
import {cssMaxBytes} from '../../../../packages/css-codec/parser.js';
import {readBoundedFile,downloadBytes} from '../../transfer/browser-files.js';
const props=defineProps({kind:{type:String,required:true},document:{type:Object,required:true},capabilities:Object});
const emit=defineEmits(['import']);const source=ref(''),input=ref(null),message=ref('');
const plan=computed(()=>source.value.trim()?importCss(source.value,{kind:props.kind,document:props.document,capabilities:props.capabilities}):null);
async function file(event){try{const bytes=await readBoundedFile(event.target.files[0],cssMaxBytes);source.value=new TextDecoder('utf8',{fatal:true}).decode(bytes);message.value='';}catch(e){message.value=e.message;}finally{event.target.value='';}}
function apply(){if(!plan.value?.ok)return;emit('import',plan.value.document);message.value='Применено CSS-свойств: '+plan.value.changes;source.value='';}
function exportFile(){try{const css=exportCss(props.document,{kind:props.kind});downloadBytes(css,(props.document.id??props.document.name??'styles')+'.css','text/css');source.value=css;message.value='CSS выгружен в файл и поле ниже';}catch(e){message.value=e.message;}}
async function copy(){try{await navigator.clipboard.writeText(source.value);message.value='CSS скопирован';}catch{message.value='Выдели текст в поле и нажми Ctrl+C';}}
</script>
<template><details class="css-transfer"><summary>CSS · импорт / экспорт</summary>
 <div class="transfer-actions"><button @click="input.click()">Открыть .css</button><button @click="exportFile">Экспорт .css</button><button :disabled="!source" @click="copy">Копировать</button><button :disabled="!plan?.ok" @click="apply">Применить CSS</button><input ref="input" type="file" accept=".css,text/css" hidden @change="file"></div>
 <textarea v-model="source" aria-label="CSS из файла или буфера" rows="5" placeholder="Вставь CSS (Ctrl+V) или открой файл. Для экрана: #root { padding: 12px; }" spellcheck="false"></textarea>
 <p v-if="plan?.ok" role="status">Готово к применению: {{plan.changes}} свойств</p>
 <ul v-if="plan&&!plan.ok" class="bad" role="alert"><li v-for="(d,i) in plan.diagnostics" :key="i">{{d.line?'Строка '+d.line+' · ':''}}{{d.selector??''}} {{d.property??''}}: {{d.message}}</li></ul>
 <p v-if="message" role="status">{{message}}</p>
 <small>Подмножество CSS: px/%, цвета, отступы, границы, шрифт из ресурсов, Flex. Селекторы #id, тип, *, :root; состояния и ::part. Неподдерживаемое оформление блокирует импорт. Здесь меняются стили, структура и текст компонентов сохраняются.</small>
</details></template>
<style>
.transfer-actions {display:flex;align-items:center;gap:var(--gap);flex-wrap:wrap;min-width:0;}
.css-transfer {border:1px solid var(--lu-border);padding:2px 5px;}
.css-transfer summary {cursor:pointer;color:var(--lu-text);}
.css-transfer[open] {display:flex;flex-direction:column;gap:var(--gap);}
.css-transfer textarea {width:100%;resize:vertical;min-height:64px;max-height:240px;font-family:Consolas,monospace;}
.css-transfer ul {margin:0;padding-left:18px;max-height:100px;overflow:auto;}
.css-transfer p {margin:0;}
.css-transfer small {display:block;color:var(--lu-text-muted);}
</style>
