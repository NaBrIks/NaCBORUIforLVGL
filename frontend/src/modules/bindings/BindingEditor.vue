<script setup>
import {computed} from 'vue';
import {bindingMethodCatalog,eventValueSchema,bindingContract,bindingLimits,dataDescriptor,dataSchemaAtPath,inspectExpression,bindingCatalogIsAuthoritative,compositionAvailable,screenViews} from '@lvgl-cbor/screen-codec';
import {createExpression,bindingTargetSchema} from './binding-model.js';
import ExpressionInput from './ExpressionInput.vue';
import SourcePathInput from './SourcePathInput.vue';
import CornerFrame from '../../components/CornerFrame.vue';
import Icon from '../../components/Icon.vue';
import './bindings.css';
import NavigationTargetInput from '../composition/NavigationTargetInput.vue';
const props=defineProps({modelValue:{type:Object,required:true},screen:Object,family:{type:Object,required:true},capabilities:Object}),emit=defineEmits(['update:modelValue']);
const methods=computed(()=>bindingMethodCatalog(props.family)),bindings=computed(()=>props.modelValue.bindings??[]),events=computed(()=>props.modelValue.events??[]),catalog=computed(()=>props.capabilities?.binding);
const actions=computed(()=>catalog.value?.actions??[]),writable=computed(()=>(catalog.value?.sources??[]).filter(s=>s.writable)),authoritative=computed(()=>bindingCatalogIsAuthoritative(props.capabilities));
const eventNames=computed(()=>catalog.value?.events??bindingContract.events);
const limits=computed(()=>bindingLimits(props.capabilities));
const navigationViews=computed(()=>screenViews(props.screen)),canNavigate=computed(()=>compositionAvailable(props.capabilities)&&navigationViews.value.length>0);
function edit(key,value){emit('update:modelValue',{...props.modelValue,[key]:value});}
function updateRule(key,index,value){const next=[...(props.modelValue[key]??[])];next[index]=value;edit(key,next);}
function remove(key,index){edit(key,(props.modelValue[key]??[]).filter((_,i)=>i!==index));}
function target(rule){return methods.value.find(entry=>entry.scope===(rule.scope??'widget')&&entry.method.alias===rule.method);}
function defaultExpression(schema){const type=dataDescriptor(schema)?.type;return createExpression(type==='object'?'object':type==='tuple'?'array':'literal',schema);}
function addBinding(){const entry=methods.value.find(m=>m.scope==='widget')??methods.value[0];if(!entry)return;edit('bindings',[...bindings.value,{...(entry.scope==='common'?{scope:'common'}:{}),method:entry.method.alias,value:defaultExpression(bindingTargetSchema(entry))}]);}
function changeMethod(index,value){const [scope,method]=value.split('|'),entry=methods.value.find(m=>m.scope===scope&&m.method.alias===method);if(!entry)return;updateRule('bindings',index,{...(scope==='common'?{scope}:{}),method,value:defaultExpression(bindingTargetSchema(entry))});}
function format(index,key,value){const rule=bindings.value[index],next={...rule.format};if(value===undefined)delete next[key];else next[key]=value;updateRule('bindings',index,{...rule,format:next});}
function newEvent(mode,event='clicked'){
 if(mode==='navigate'){const view=navigationViews.value[0];return {event,navigate:{view:view?.node??'',screen:view?.initial??''}};}
 if(mode==='write'){const source=writable.value[0];return {event,write:{source:source?.name??'',path:[]},value:{event:'value'}};}
 const action=actions.value[0];return {event,action:action?.name??'',args:defaultExpression(action?.schema??'null')};
}
function addEvent(){edit('events',[...events.value,newEvent(actions.value.length?'action':writable.value.length?'write':canNavigate.value&&!events.value.some(rule=>rule.navigate)?'navigate':'action')]);}
function actionSchema(rule){return actions.value.find(a=>a.name===rule.action)?.schema;}
function writeSchema(rule){try{return dataSchemaAtPath(catalog.value?.sources.find(s=>s.name===rule.write.source)?.schema,rule.write.path??[]);}catch{return undefined;}}
function changeAction(index,name){const rule=events.value[index],schema=actions.value.find(a=>a.name===name)?.schema;updateRule('events',index,{event:rule.event,action:name,args:defaultExpression(schema??'null')});}
function expressionError(expression,event){try{inspectExpression(expression,{capabilities:props.capabilities,eventContext:!!event,eventSchema:event?eventValueSchema(props.family,event):undefined});return '';}catch(error){return error.message;}}
function canChooseNavigation(rule){return canNavigate.value&&!events.value.some(entry=>entry!==rule&&entry.navigate);}
</script>
<template><CornerFrame class="binding-editor property-category" :level="1" title="Данные и события"><template #header><h3 data-tooltip="Привязки используют зарегистрированные данные приложения. События вызывают разрешённые действия или запись в источник. Правила живут вместе с компонентом.">Данные и события</h3></template>
 <div class="binding-section-head"><strong>Привязки</strong><button class="action-button icon-action" :disabled="!methods.length||bindings.length>=limits.bindings||authoritative&&!catalog" aria-label="Добавить привязку" data-tooltip="Привязать данные к методу выбранного компонента" @click="addBinding"><Icon name="plus"/></button></div>
 <div v-for="(rule,index) in bindings" :key="index" class="binding-rule">
  <div class="binding-rule-head"><label>Метод</label><select :aria-label="'Привязка '+(index+1)+' метод'" :value="(rule.scope??'widget')+'|'+rule.method" @change="changeMethod(index,$event.target.value)"><option v-if="!target(rule)" :value="(rule.scope??'widget')+'|'+rule.method">{{rule.scope??'widget'}}:{{rule.method}} · недоступен</option><optgroup label="Компонент"><option v-for="entry in methods.filter(m=>m.scope==='widget')" :key="entry.method.opcode" :value="'widget|'+entry.method.alias">{{entry.method.title??entry.method.alias}}</option></optgroup><optgroup label="Общие LVGL"><option v-for="entry in methods.filter(m=>m.scope==='common')" :key="entry.method.opcode" :value="'common|'+entry.method.alias">{{entry.method.title??entry.method.alias}}</option></optgroup></select><button class="action-button icon-action" :aria-label="'Удалить привязку '+(index+1)" data-tooltip="Удалить привязку" @click="remove('bindings',index)"><Icon name="trash"/></button></div>
  <ExpressionInput :model-value="rule.value" :schema="bindingTargetSchema(target(rule))" :capabilities="capabilities" :label="'Привязка '+(index+1)" @update:model-value="updateRule('bindings',index,{...rule,value:$event})"/>
  <div v-if="bindingTargetSchema(target(rule))?.type==='text'" class="binding-format"><label>Знаки <input type="number" min="0" max="6" :aria-label="'Привязка '+(index+1)+' точность'" :value="rule.format?.precision??''" @input="format(index,'precision',$event.target.value===''?undefined:$event.target.valueAsNumber)"></label><label>До <input :aria-label="'Привязка '+(index+1)+' префикс'" :value="rule.format?.prefix??''" @input="format(index,'prefix',$event.target.value)"></label><label>После <input :aria-label="'Привязка '+(index+1)+' суффикс'" :value="rule.format?.suffix??''" @input="format(index,'suffix',$event.target.value)"></label><label>Нет данных <input :aria-label="'Привязка '+(index+1)+' неизвестно'" :value="rule.format?.unknown??'--'" @input="format(index,'unknown',$event.target.value)"></label></div>
  <p v-if="expressionError(rule.value)" class="bad binding-error" role="alert">{{expressionError(rule.value)}}</p>
 </div>
 <div class="binding-section-head"><strong>События</strong><button class="action-button icon-action" :disabled="events.length>=limits.events||authoritative&&(!canNavigate||events.some(rule=>rule.navigate))&&(!catalog||!actions.length&&!writable.length)" aria-label="Добавить событие" data-tooltip="Настроить действие приложения, запись или переход страницы" @click="addEvent"><Icon name="plus"/></button></div>
 <div v-for="(rule,index) in events" :key="index" class="binding-rule">
  <div class="binding-rule-head"><label>Событие</label><select :aria-label="'Событие '+(index+1)+' тип'" :value="rule.event" @change="updateRule('events',index,{...rule,event:$event.target.value})"><option v-if="!eventNames.includes(rule.event)" :value="rule.event">{{rule.event}}</option><option v-for="name in eventNames" :key="name" :value="name">{{name}}</option></select><select :aria-label="'Событие '+(index+1)+' назначение'" :value="rule.navigate?'navigate':rule.write?'write':'action'" @change="updateRule('events',index,newEvent($event.target.value,rule.event))"><option value="action">Действие</option><option value="write">Запись</option><option v-if="canNavigate||rule.navigate" value="navigate" :disabled="!canChooseNavigation(rule)">Переход</option></select><button class="action-button icon-action" :aria-label="'Удалить событие '+(index+1)" data-tooltip="Удалить обработчик события" @click="remove('events',index)"><Icon name="trash"/></button></div>
  <NavigationTargetInput v-if="rule.navigate" :model-value="rule.navigate" :screen="screen" :label="'Событие '+(index+1)" @update:model-value="updateRule('events',index,{...rule,navigate:$event})"/>
  <template v-else-if="rule.write"><SourcePathInput :model-value="rule.write" :capabilities="capabilities" writable :label="'Событие '+(index+1)+' запись'" @update:model-value="updateRule('events',index,{...rule,write:$event})"/><ExpressionInput :model-value="rule.value" :schema="writeSchema(rule)" :capabilities="capabilities" event-context :event-schema="eventValueSchema(family,rule.event)" :label="'Событие '+(index+1)+' значение'" @update:model-value="updateRule('events',index,{...rule,value:$event})"/></template>
  <template v-else><div class="binding-action-target"><label>Действие</label><select :aria-label="'Событие '+(index+1)+' действие'" :value="rule.action" @change="changeAction(index,$event.target.value)"><option v-if="!actions.some(a=>a.name===rule.action)" :value="rule.action">{{rule.action||'Выберите действие…'}}</option><option v-for="action in actions" :key="action.name" :value="action.name">{{action.name}}</option></select><input v-if="!authoritative&&!actions.some(a=>a.name===rule.action)" :aria-label="'Событие '+(index+1)+' имя действия офлайн'" :value="rule.action" @change="changeAction(index,$event.target.value)"></div><ExpressionInput :model-value="rule.args" :schema="actionSchema(rule)" :capabilities="capabilities" event-context :event-schema="eventValueSchema(family,rule.event)" :label="'Событие '+(index+1)+' аргументы'" @update:model-value="updateRule('events',index,{...rule,args:$event})"/></template>
  <p v-if="!rule.navigate&&expressionError(rule.write?rule.value:rule.args,rule.event)" class="bad binding-error" role="alert">{{expressionError(rule.write?rule.value:rule.args,rule.event)}}</p>
 </div>
 <p v-if="!authoritative" class="binding-offline-note">Каталог МК не подтверждён. Имена сохраняются; совместимость проверяется при применении.</p>
</CornerFrame></template>
