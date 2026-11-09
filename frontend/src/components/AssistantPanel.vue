<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,onBeforeUnmount,onMounted,reactive,ref,watch} from 'vue';
import {DataClient} from '../../../packages/project-codec/data-client.js';
import {assistantBudget} from '../../../packages/project-codec/assistant-budget.js';
import {decodePacket} from '@lvgl-cbor/style-codec';
import {createLiveData} from '../state/live-data.js';
import {ReconnectingSocket} from '../ws-link.js';
import {t} from '../state/appearance';
import Icon from './Icon.vue';
import AssistantAttachments from './AssistantAttachments.vue';
import AssistantConversation from './AssistantConversation.vue';
import ProjectRecovery from './ProjectRecovery.vue';
import {assistantImageLimits,prepareAssistantAttachment,validateAssistantFiles,uploadAssistantImages} from '../state/assistant-images.js';

defineProps({persistent:{type:Boolean,default:false},mode:{type:String,default:'all'}});
const emit=defineEmits(['close','log']);
const caps=ref(null),connected=ref(false),working=ref(false),error=ref(''),secret=ref(''),details=ref();
const chatPreviews=reactive({});
const attachments=ref([]),preparingImages=ref(false),imagePicker=ref();
const form=reactive({endpoint:'',model:'',prompt:'',free_only:true,model_filter:''}),dirty=reactive({endpoint:false,model:false,prompt:false,free_only:false,model_filter:false});
const state=reactive({status:'',reply:'',models:'',model_catalog:[],model_page:{offset:0,total:0,shown:0},key_present:false,busy:false,completion:{generation:0,ok:false},log:[],chat:{id:'',total:0,offset:0,nextOffset:-1,messages:[]}});
watch(()=>state.log,records=>emit('log',records),{immediate:true});
const idleWaiters=new Set();
const pendingFilter=ref(false);
const previousOffsets=ref([]),statusVersion=ref(0),phase=ref(t('Выполняется','Working')),elapsed=ref(0),chosenModel=ref(null);
const client=new DataClient(()=>location.origin);
const available=computed(()=>caps.value?.binding?.sources?.some(item=>item.name==='assistant.endpoint')===true);
const blocked=computed(()=>!connected.value||!available.value||working.value||state.busy);
const canSend=computed(()=>!blocked.value&&!preparingImages.value&&Boolean(form.prompt.trim()));
const models=computed(()=>caps.value?.binding?.sources?.some(item=>item.name==='assistant.model_catalog')?state.model_catalog:state.models.split('\n').filter(value=>value&&value!=='—').map(id=>({id,title:id})));
const modelIndex=computed(()=>models.value.findIndex(item=>item.id===form.model));
const modelPage=computed(()=>caps.value?.binding?.sources?.some(item=>item.name==='assistant.model_page')?state.model_page:{offset:0,total:models.value.length,shown:models.value.length});
const selectedModel=computed(()=>models.value.find(item=>item.id===form.model)||(chosenModel.value?.id===form.model?chosenModel.value:null));
const failed=computed(()=>Boolean(error.value)||(!working.value&&!state.busy&&state.completion.generation>0&&!state.completion.ok));
const feedback=computed(()=>error.value||(!connected.value?t('Подключение…','Connecting…'):working.value||state.busy?(statusVersion.value>phaseStatusVersion&&state.status&&state.status!=='Выполняется'?state.status:phase.value):state.status||t('Готово','Ready')));
const shortStatus=computed(()=>error.value?t('Ошибка','Error'):!connected.value?t('Нет связи','Disconnected'):state.busy||working.value?t('Выполняется','Working'):state.status||t('Готов','Ready'));
let disposed=false,epoch=0,loadingCaps,filterTimer,forceModelRefresh=false,requestedOffset=0,requestedHistory=[],phaseStatusVersion=0,elapsedStart=null,elapsedTimer;
function setPhase(value){phase.value=value;phaseStatusVersion=statusVersion.value;}
watch([working,()=>state.busy],([local,remote])=>{
 if(local||remote){if(elapsedStart===null){elapsedStart=performance.now();elapsed.value=0;elapsedTimer=setInterval(()=>elapsed.value=Math.floor((performance.now()-elapsedStart)/1000),250);}}
 else if(elapsedStart!==null){elapsed.value=Math.floor((performance.now()-elapsedStart)/1000);elapsedStart=null;clearInterval(elapsedTimer);}
},{flush:'sync'});
watch([models,()=>form.model],()=>{const selected=models.value.find(item=>item.id===form.model);if(selected)chosenModel.value=selected;});
function accept(sources){
 for(const source of sources){
  if(!source.name.startsWith('assistant.')||source.state!=='known')continue;
  const name=source.name.slice('assistant.'.length);
  if(Object.hasOwn(form,name)){if(!dirty[name])form[name]=source.value;}
  else if(Object.hasOwn(state,name))state[name]=source.value;
 }
}
const live=createLiveData({capabilities:()=>caps.value,read:()=>client.read(),changed:accept});
const socket=new ReconnectingSocket({
 onState:value=>{connected.value=value==='online';live.socketState(value);},
 onError:message=>{error.value=message;},
 onMessage:event=>{
  try{
   if(!(event.data instanceof ArrayBuffer))throw Error('Binary CBOR expected');
   const frame=decodePacket(new Uint8Array(event.data),32768);
   if(frame.get('event')==='data_catalog_changed'&&frame.get('catalogRevision')!==caps.value?.binding?.catalogRevision)void capabilities();
   if(frame.get('source')?.startsWith('assistant.')){const accepted=live.event(frame);if(accepted&&frame.get('source')==='assistant.status')statusVersion.value++;}
  }catch(e){error.value=e.message;}
 }
});
async function capabilities(){
 if(loadingCaps)return loadingCaps;
 loadingCaps=(async()=>{
  try{
   const response=await fetch('/api/capabilities',{cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('Capabilities HTTP '+response.status);
   const value=await response.json();if(disposed)return;
   caps.value=value;if(!available.value)throw Error('Assistant data group is unavailable');
   error.value='';const url=new URL('/ws',location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';
   if(!socket.active)socket.start(String(url));
  }catch(e){if(!disposed)error.value=e.message;}
 })();
 try{await loadingCaps;}finally{loadingCaps=null;}
}
async function run(operation){
 const current=++epoch;setPhase(t('Сохранение настроек','Saving settings'));working.value=true;error.value='';
 const active=()=>{if(disposed||current!==epoch)throw Error('cancelled');};
 try{await operation(active);}catch(e){if(!disposed&&current===epoch&&e.message!=='cancelled')error.value=e.message;}
 finally{if(current===epoch)working.value=false;}
}
async function write(name,active,clean=true,value=form[name]){
 await client.write('assistant.'+name,[],value,caps.value);active();
 if(clean&&form[name]===value)dirty[name]=false;
}
function waitForIdle(after,active,timeout=10000){
 return new Promise((resolve,reject)=>{
  let stop=()=>{},done=false,readingError=false;const finish=reason=>{if(done)return;done=true;clearTimeout(timer);stop();idleWaiters.delete(finish);reason?reject(reason):resolve();};
  const timer=setTimeout(()=>finish(Error('Assistant operation completion timeout')),timeout);
  const check=()=>{try{active();if(!connected.value)throw Error('Assistant WS disconnected');if(state.completion.generation>after&&!state.busy){if(!state.completion.ok){if(!readingError){readingError=true;void client.query({kind:'values',name:'assistant.status',maxBytes:2048}).then(page=>{active();finish(Error(page.items[0]?.value||t('Операция не выполнена','Operation failed')));}).catch(()=>finish(Error(t('Операция не выполнена; причина недоступна','Operation failed; details unavailable'))));}return;}finish();}}catch(e){finish(e);}};
  idleWaiters.add(finish);stop=watch([()=>state.completion.generation,()=>state.busy,connected],check,{flush:'sync'});check();
 });
}
async function configure(active){
 setPhase(t('Сохранение настроек','Saving settings'));
 const names=['endpoint','model','free_only','model_filter'],intended=Object.fromEntries(names.map(name=>[name,form[name]]));
 for(const name of names){dirty[name]=true;await write(name,active,false,intended[name]);}
 const after=await completionBaseline(active);
 if(secret.value){const key=secret.value;secret.value='';await client.invoke('assistant.key',key,caps.value);active();}
 else {await client.invoke('assistant.save',true,caps.value);active();}
 await waitForIdle(after,active);active();
 for(const name of names)if(form[name]===intended[name])dirty[name]=false;
}
function save(){void run(configure);}
async function completionBaseline(active){
 const baseline=await client.query({kind:'values',name:'assistant.completion',detail:true,maxBytes:512});active();
 const value=baseline.items[0]?.value?.generation;if(!Number.isSafeInteger(value))throw Error('Assistant completion source unavailable');return value;
}
async function applyFilter(){
 if(disposed||!pendingFilter.value||filterTimer||blocked.value)return;
 pendingFilter.value=false;const refresh=forceModelRefresh;forceModelRefresh=false;
 const intended={free_only:form.free_only,model_filter:form.model_filter},offset=requestedOffset,history=[...requestedHistory];
 await run(async active=>{
  setPhase(t('Список моделей','Model list'));
  for(const name of ['free_only','model_filter']){dirty[name]=true;await write(name,active,false,intended[name]);}
  await client.write('assistant.model_offset',[],offset,caps.value);active();
  const after=await completionBaseline(active);await client.invoke('assistant.list_models',refresh,caps.value);active();await waitForIdle(after,active,50000);active();
  previousOffsets.value=history;
  for(const name of ['free_only','model_filter'])if(form[name]===intended[name])dirty[name]=false;
 });
 if(pendingFilter.value&&!filterTimer)void applyFilter();
}
function listModels(){clearTimeout(filterTimer);filterTimer=null;forceModelRefresh=true;requestedOffset=0;requestedHistory=[];previousOffsets.value=[];pendingFilter.value=true;void applyFilter();}
function filterChanged(delayed=true){
 clearTimeout(filterTimer);filterTimer=null;requestedOffset=0;requestedHistory=[];previousOffsets.value=[];pendingFilter.value=true;
 if(delayed)filterTimer=setTimeout(()=>{filterTimer=null;void applyFilter();},350);else void applyFilter();
}
watch([working,()=>state.busy,connected],()=>{if(pendingFilter.value&&!filterTimer)void applyFilter();});
function pageModels(next){
 if(blocked.value||pendingFilter.value)return;
 const page=modelPage.value;
 if(next){if(!page.shown||page.offset+page.shown>=page.total||page.offset+page.shown>4095)return;requestedOffset=page.offset+page.shown;requestedHistory=[...previousOffsets.value,page.offset];}
 else {if(!previousOffsets.value.length)return;requestedHistory=previousOffsets.value.slice(0,-1);requestedOffset=previousOffsets.value.at(-1);}
 forceModelRefresh=false;pendingFilter.value=true;void applyFilter();
}
function send(){if(!canSend.value)return;const prompt=form.prompt,images=[...attachments.value];void run(async active=>{await configure(active);setPhase(t('Подготовка изображений','Preparing images'));await uploadAssistantImages(client,images,caps.value,{active,progress:(index,total)=>setPhase(t('Загрузка изображения ','Uploading image ')+index+' / '+total)});await write('prompt',active,true,prompt);const after=await completionBaseline(active);setPhase(t('Запрос модели','Model request'));chatPreviews[state.chat.id+':'+(state.chat.total+1)]=images;const beforeTotal=state.chat.total;await client.invoke('assistant.send',true,caps.value);active();await waitForIdle(after,active,assistantBudget.taskTimeoutMs+assistantBudget.clientGraceMs);active();if(state.chat.total>beforeTotal){attachments.value=attachments.value.filter(file=>!images.includes(file));if(form.prompt===prompt){form.prompt='';dirty.prompt=true;await client.write('assistant.prompt',[],'',caps.value);active();}}});}
function newChat(){if(blocked.value)return;void run(async active=>{const after=await completionBaseline(active);await client.invoke('assistant.new_chat',true,caps.value);active();await waitForIdle(after,active);form.prompt='';dirty.prompt=true;attachments.value=[];for(const key of Object.keys(chatPreviews))delete chatPreviews[key];await client.write('assistant.prompt',[],'',caps.value);});}
function chatPage(offset){if(blocked.value)return;void run(async active=>{const after=await completionBaseline(active);await client.invoke('assistant.chat_page',offset,caps.value);active();await waitForIdle(after,active);});}
function chooseModel(event){
 const index=Number(event.target.value);if(!Number.isInteger(index)||index<0||index>=models.value.length)return;
 form.model=models.value[index].id;dirty.model=true;
}
async function addImages(files){
 if(preparingImages.value)return;
 try{
  const selected=validateAssistantFiles(files,attachments.value.length);if(!selected.length)return;
  preparingImages.value=true;error.value='';const prepared=[];
  for(const file of selected){const image=await prepareAssistantAttachment(file);if(disposed)return;prepared.push(image);}
  attachments.value=[...attachments.value,...prepared];
 }catch(e){if(!disposed)error.value=e.message;}
 finally{preparingImages.value=false;}
}
function pasteImages(event){const files=Array.from(event.clipboardData?.files??[]);if(!files.length)return;event.preventDefault();void addImages(files);}
function pickImages(event){void addImages(event.target.files);event.target.value='';}
function promptKey(event){if(event.ctrlKey&&event.key==='Enter'&&!event.isComposing){event.preventDefault();if(canSend.value)send();}}
async function cancel(){
 setPhase(t('Остановка','Stopping'));
 clearTimeout(filterTimer);filterTimer=null;pendingFilter.value=false;forceModelRefresh=false;
 ++epoch;for(const finish of [...idleWaiters])finish(Error('cancelled'));working.value=false;error.value='';
 try{await client.invoke('assistant.cancel',true,caps.value);}catch(e){if(!disposed)error.value=e.message;}
}
onMounted(()=>void capabilities());
onBeforeUnmount(()=>{disposed=true;++epoch;clearTimeout(filterTimer);clearInterval(elapsedTimer);for(const finish of [...idleWaiters])finish(Error('cancelled'));secret.value='';attachments.value=[];socket.stop();live.dispose();});
</script>
<template>
 <aside class="assistant-panel" :class="'assistant-mode-'+mode" :aria-label="t('Ассистент интерфейса','UI assistant')">
  <input ref="imagePicker" class="assistant-image-input" type="file" accept="image/png,image/jpeg,image/webp,application/json,.json" multiple @change="pickImages">
  <template v-if="mode==='work'"><form class="assistant-workbar" @submit.prevent="send"><textarea v-model="form.prompt" rows="3" :aria-label="t('Запрос ассистенту','Assistant prompt')" :placeholder="t('Опишите, что изменить на экране… Ctrl+Enter — отправить','Describe what to change on the screen… Ctrl+Enter to send')" @input="dirty.prompt=true" @keydown="promptKey" @paste="pasteImages"></textarea><div class="assistant-work-actions"><button class="action-button primary" type="submit" :disabled="!canSend">{{t('Отправить','Send')}}</button><button class="action-button" type="button" :disabled="blocked||!caps?.binding?.actions?.some(a=>a.name==='assistant.new_chat')" @click="newChat">{{t('Новый чат','New chat')}}</button><button class="action-button" type="button" :disabled="!connected||!available||(!working&&!state.busy)" @click="cancel">{{t('Остановить','Stop')}}</button><button class="action-button" type="button" :disabled="preparingImages||attachments.length>=assistantImageLimits.count" @click="imagePicker.click()">{{t('Вложения','Attachments')}}</button><button type="button" class="icon-button" :aria-label="t('Ответ и сведения','Reply and details')" :data-tooltip="t('Открыть ответ и сведения','Open reply and details')" @click="details.showModal()"><Icon name="info-circle"/></button></div></form><AssistantAttachments :items="attachments" @remove="attachments.splice($event,1)"/><div class="assistant-work-feedback" :class="failed?'bad':'muted'"><span class="assistant-elapsed" :data-tooltip="t('Время операции в этой вкладке','Operation time in this tab')">{{elapsed}} {{t('с','s')}}</span><span class="assistant-phase">{{preparingImages?t('Подготовка изображения…','Preparing image…'):feedback}}</span></div><AssistantConversation :chat="state.chat" :previews="chatPreviews" :disabled="blocked" @page="chatPage"/></template>
  <header v-else class="assistant-head"><strong>{{mode==='settings'?t('Модель и связь','Model and connection'):t('Ассистент','Assistant')}}</strong><span class="assistant-state" :class="failed?'bad':'muted'" :data-tooltip="error||state.status">{{shortStatus}}</span><button class="icon-button" :aria-label="t('Сведения ассистента','Assistant details')" :data-tooltip="t('Сведения ассистента','Assistant details')" @click="details.showModal()"><Icon name="info-circle"/></button><button v-if="!persistent" class="icon-button" :aria-label="t('Закрыть ассистента','Close assistant')" :data-tooltip="t('Закрыть ассистента','Close assistant')" @click="emit('close')"><Icon name="x"/></button></header>
  <div v-if="mode!=='work'" class="assistant-controls"><section class="assistant-settings">
   <label>{{t('Адрес API','API endpoint')}}<input v-model="form.endpoint" type="url" autocomplete="off" spellcheck="false" @input="dirty.endpoint=true"></label>
   <label>{{t('Ключ API','API key')}}<input v-model="secret" type="password" autocomplete="new-password" :placeholder="state.key_present?t('Сохранён · новый заменит его','Stored · enter to replace'):t('Не задан','Not set')" :data-tooltip="t('Новый ключ заменит сохранённый. В проект интерфейса ключ не попадает.','A new key replaces the stored one. The key is not included in the UI project.')"></label>
   <label class="assistant-free"><span>{{t('Выбор','Selection')}}</span><span><input v-model="form.free_only" type="checkbox" @change="dirty.free_only=true;filterChanged(false)"> {{t('Только бесплатные','Free only')}}</span></label>
   <label>{{t('Фильтр','Filter')}}<input v-model="form.model_filter" type="search" :placeholder="t('Название или ID модели','Model name or ID')" @input="dirty.model_filter=true;filterChanged()" @keydown.enter.prevent="listModels"></label>
   <label>{{t('Модель','Model')}}<select :value="modelIndex" :data-tooltip="(selectedModel?.title||'')+'\n'+form.model" :disabled="blocked||!models.length" @change="chooseModel"><option :value="-1">{{form.model?(t('Выбрана: ','Selected: ')+form.model+' · '+t('вне страницы','outside page')):t('Выберите модель','Select model')}}</option><option v-for="(model,index) in models" :key="model.id" :value="index">{{model.title||model.id}}{{model.title&&model.title!==model.id?' · '+model.id:''}}{{model.free===true?' · '+t('бесплатно','free'):''}}</option></select></label>
   <div class="assistant-selected-model" :aria-label="t('Выбранная модель','Selected model')"><code>{{form.model||'—'}}</code><span v-if="selectedModel?.title&&selectedModel.title!==form.model">{{selectedModel.title}}</span></div>
   <div class="assistant-model-page"><span>{{modelPage.shown?modelPage.offset+1:0}}–{{modelPage.shown?modelPage.offset+modelPage.shown:0}} {{t('из','of')}} {{modelPage.total}}</span><button class="action-button" :disabled="blocked||pendingFilter||!previousOffsets.length" @click="pageModels(false)">{{t('Назад','Previous')}}</button><button class="action-button" :disabled="blocked||pendingFilter||!modelPage.shown||modelPage.offset+modelPage.shown>=modelPage.total||modelPage.offset+modelPage.shown>4095" @click="pageModels(true)">{{t('Далее','Next')}}</button></div>
   <details class="assistant-manual-model"><summary>{{t('ID модели вручную','Enter model ID')}}</summary><input v-model="form.model" :aria-label="t('ID модели','Model ID')" autocomplete="off" spellcheck="false" @input="dirty.model=true"></details>
   <div class="assistant-actions"><button class="action-button primary" :disabled="blocked" @click="save">{{t('Сохранить','Save')}}</button><button class="action-button" :disabled="!connected||!available" :data-tooltip="t('Проверить соединение с провайдером и обновить список моделей. Запрос к языковой модели не отправляется.','Check the provider connection and refresh its model list. No language-model prompt is sent.')" @click="listModels">{{pendingFilter?t('Модели · ожидает','Models · queued'):t('Проверить / обновить модели','Check / refresh models')}}</button><span class="assistant-model-count" :data-tooltip="t('Моделей в полученном списке после фильтрации','Models returned after filtering')">{{models.length}}</span><button v-if="!connected" class="icon-button" :aria-label="t('Подключиться','Reconnect')" :data-tooltip="t('Подключиться','Reconnect')" @click="capabilities"><Icon name="refresh"/></button></div>
  </section>
  <template v-if="mode==='all'"><label class="assistant-prompt">{{t('Запрос','Prompt')}}<textarea v-model="form.prompt" rows="3" @input="dirty.prompt=true" @keydown="promptKey" @paste="pasteImages"></textarea></label><div class="assistant-actions"><button class="action-button primary" :disabled="!canSend" @click="send">{{t('Отправить','Send')}}</button><button class="action-button" :disabled="!connected||!available||(!working&&!state.busy)" @click="cancel">{{t('Остановить','Stop')}}</button><button class="action-button" :disabled="preparingImages||attachments.length>=assistantImageLimits.count" @click="imagePicker.click()">{{t('Картинки','Images')}} · {{attachments.length}}</button></div></template>
  <nav v-if="mode==='settings'" class="assistant-extra-links"><a href="/editor/?mode=manual">{{t('Расширенный редактор проекта','Advanced project editor')}}</a><a href="/viewer">{{t('Только экран приложения','Application screen only')}}</a></nav><ProjectRecovery v-if="mode==='settings'" mode="base" :disabled="working||state.busy"/></div>
  <AssistantAttachments v-if="mode==='all'" :items="attachments" @remove="attachments.splice($event,1)"/><pre v-if="mode==='all'" class="assistant-reply" tabindex="0" :aria-label="t('Ответ ассистента','Assistant reply')">{{state.reply||'—'}}</pre>
  <dialog ref="details" class="assistant-details"><h2>{{t('Ассистент','Assistant')}}</h2><p>{{state.status||'—'}}</p><p v-if="error"><code>{{error}}</code></p><pre class="assistant-dialog-reply" tabindex="0" :aria-label="t('Ответ ассистента','Assistant reply')">{{state.reply||'—'}}</pre><form method="dialog"><button class="action-button">{{t('Закрыть','Close')}}</button></form></dialog>
 </aside>
</template>
<style scoped>
.assistant-panel{width:min(420px,42vw);min-width:280px;max-width:100%;height:100%;min-height:0;display:flex;flex-direction:column;gap:6px;border-left:1px solid var(--lu-border);padding:8px;background:var(--lu-surface);color:var(--lu-text);overflow:hidden;}
.assistant-panel.assistant-mode-work{flex:none;width:100%;min-width:0;height:auto;border-left:0;border-bottom:1px solid var(--lu-border);padding:4px 8px;gap:2px;}.assistant-workbar{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0;}.assistant-workbar>textarea{width:100%;flex:none;min-width:0;min-height:60px;max-height:25vh;resize:vertical;}.assistant-work-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;flex:none;}.assistant-work-feedback{display:flex;align-items:flex-start;gap:8px;min-width:0;height:60px;line-height:20px;}.assistant-elapsed{width:6ch;flex:none;text-align:right;font-variant-numeric:tabular-nums;}.assistant-phase{flex:1;min-width:0;max-height:60px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;}.assistant-panel.assistant-mode-settings{width:min(800px,100%);min-width:0;border:0;padding:12px;}.assistant-mode-settings .assistant-controls{flex:1;}.assistant-extra-links{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px;}
.assistant-image-input{display:none;}
.assistant-head{display:flex;align-items:center;gap:6px;flex:none;}.assistant-head strong{margin-right:auto;}.assistant-state{width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.assistant-controls{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;gap:6px;overflow:auto;overscroll-behavior:contain;}
.assistant-settings{display:flex;flex-direction:column;gap:5px;}.assistant-settings label{display:grid;grid-template-columns:76px minmax(0,1fr);gap:5px;align-items:center;}.assistant-settings input,.assistant-settings select{width:100%;min-width:0;}
.assistant-free input{width:auto;}.assistant-free>span:last-child{display:flex;align-items:center;gap:5px;}.assistant-manual-model summary{cursor:pointer;color:var(--lu-text-muted);}.assistant-manual-model input{width:100%;margin-top:3px;}
.assistant-model-count{margin-left:auto;min-width:2ch;text-align:right;align-self:center;font-variant-numeric:tabular-nums;color:var(--lu-text-muted);}
.assistant-selected-model{margin-left:81px;min-height:34px;max-height:54px;display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;overflow-wrap:anywhere;font-size:inherit;}.assistant-selected-model code{font-size:inherit;}.assistant-model-page{display:flex;align-items:center;justify-content:flex-end;gap:5px;font-variant-numeric:tabular-nums;}.assistant-model-page span{margin-right:auto;}
.assistant-actions{display:flex;gap:5px;flex:none;}.assistant-prompt{display:flex;flex-direction:column;gap:3px;flex:none;}.assistant-prompt textarea{width:100%;min-height:60px;max-height:25vh;resize:vertical;}
.assistant-reply{flex:1;min-height:100px;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;border-top:1px solid var(--lu-border);padding-top:6px;font:inherit;}
.assistant-details{max-width:min(520px,calc(100vw - 32px));padding:12px;border:1px solid var(--lu-border);background:var(--lu-surface);color:var(--lu-text);}.assistant-details h2{font-size:16px;margin:0 0 8px;}.assistant-details form{text-align:right;}
.assistant-dialog-reply{max-height:60vh;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;}
@media(max-width:650px){.assistant-panel{width:46vw;min-width:250px;}.assistant-settings label{grid-template-columns:1fr;gap:2px;}}
</style>
