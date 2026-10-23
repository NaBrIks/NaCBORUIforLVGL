<script setup>
import EditorTransfers from './EditorTransfers.vue';
import Icon from './Icon.vue';
import ContextMenu from './ContextMenu.vue';
import {computed,inject,ref,onBeforeUnmount} from 'vue';
import {clone,createNode,findNode,flattenNodes,nextId,removeNode,moveNode,isTreeContainer,canMoveNodeTo,moveNodeTo} from '../screen-model';
import ScreenNodeProperties from './ScreenNodeProperties.vue';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
const {capabilities,families}=useRuntimeCapabilities();
const props=defineProps({modelValue:{type:Object,required:true},selected:{type:String,default:'root'},resources:{type:Array,default:()=>[]}});
const emit=defineEmits(['update:modelValue','update:selected']);
const addType=ref(''),message=ref('');
const project=inject('lvgl-project',null),context=ref(null),dragged=ref(''),dropTarget=ref(null);
const nativeFamilies=computed(()=>families.value.filter(f=>f.abi));
const standardFamilies=computed(()=>families.value.filter(f=>!f.abi));
const editor=ref(null),treeWidth=ref(220);
let stopResize=null;
function resizeTree(width){treeWidth.value=Math.max(160,Math.min((editor.value?.clientWidth??700)-320,width));}
function startTreeResize(event){const handle=event.currentTarget,start=event.clientX,width=editor.value.querySelector('.screen-tree-panel').clientWidth;handle.setPointerCapture(event.pointerId);const move=e=>resizeTree(width+e.clientX-start);const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);stopResize=null;};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);stopResize=end;}
onBeforeUnmount(()=>stopResize?.());
const rows=computed(()=>flattenNodes(props.modelValue.root));
const selectedRow=computed(()=>rows.value.find(row=>row.node.id===props.selected)??rows.value[0]);
const node=computed(()=>selectedRow.value.node);
function edit(fn,id=node.value.id){const doc=clone(props.modelValue),target=findNode(doc,id);if(!target)return;fn(doc,target);emit('update:modelValue',doc);message.value='';}
 function updateNode(next){edit((_,n)=>{for(const key of Object.keys(n))if(!Object.hasOwn(next,key))delete n[key];Object.assign(n,next);});}
function add(type=addType.value,target=node.value.id){try{const row=rows.value.find(row=>row.node.id===target);if(!row)return;const id=nextId(props.modelValue,type),created=createNode(type,id,capabilities?.value);edit((doc,n)=>{const parent=isTreeContainer(n)?n:row.parent?findNode(doc,row.parent.id):doc.root;parent.children??=[];parent.children.push(created);},target);addType.value=type;emit('update:selected',id);}catch(error){message.value=error.message;}}
function remove(id=node.value.id){const parent=rows.value.find(row=>row.node.id===id)?.parent?.id;if(!parent)return;edit(doc=>removeNode(doc.root,id),id);emit('update:selected',parent);}
function reorder(delta,id=node.value.id){edit(doc=>moveNode(doc.root,id,delta),id);}
function importDocument(doc){emit('update:modelValue',doc);emit('update:selected',doc.root.id);message.value='';}
function openContext(event,id){event.preventDefault();event.stopPropagation();emit('update:selected',id);event.currentTarget.focus();const rect=event.currentTarget.getBoundingClientRect();context.value={id,x:event.clientX||rect.left+12,y:event.clientY||rect.top+20};}
const contextItems=computed(()=>{
 const row=rows.value.find(row=>row.node.id===context.value?.id),current=row?.node;if(!current)return [];
 const styleRefs=[...Object.keys(project?.workspace.project.value.styles??{}).map(name=>'global:'+name),...Object.keys(props.modelValue.styles??{}).map(name=>'screen:'+name)];
 const componentItems=[...standardFamilies.value.length?[{heading:'Стандартные LVGL'},...standardFamilies.value.map(f=>({label:f.name,action:'add',value:f.name,icon:'plus'}))]:[],...nativeFamilies.value.length?[{heading:'С платы · пользовательские'},...nativeFamilies.value.map(f=>({label:f.title??f.name,hint:f.name,action:'add',value:f.name,icon:'plus'}))]:[]];
 const siblings=row.parent?.children??[],index=siblings.indexOf(current);
 return [{label:'Добавить компонент',icon:'plus',children:componentItems,disabled:!componentItems.length},{label:'Прикрепить стиль',icon:'palette',disabled:!styleRefs.length,children:styleRefs.map(ref=>({label:ref,action:'attach',value:ref,icon:'palette',disabled:(current.styles??[]).some(use=>use.ref===ref&&(!use.part||use.part==='MAIN')&&!use.state?.length)}))},...(current.styles?.length?[{label:'Снять стиль',icon:'x',children:current.styles.map((use,index)=>({label:use.ref+' · '+(use.part??'MAIN'),action:'detach',value:index,icon:'x'}))}]:[]),{separator:true},{label:'Выше в дереве',icon:'arrow-up',action:'up',disabled:!row.parent||index===0},{label:'Ниже в дереве',icon:'arrow-down',action:'down',disabled:!row.parent||index===siblings.length-1},{label:'Удалить компонент',icon:'trash',action:'remove',disabled:!row.parent}];
});
function contextCommand(item){const id=context.value?.id;if(!id)return;if(item.action==='add')add(item.value,id);else if(item.action==='attach')edit((_,n)=>{n.styles??=[];n.styles.push({ref:item.value});},id);else if(item.action==='detach')edit((_,n)=>n.styles.splice(item.value,1),id);else if(item.action==='remove')remove(id);else reorder(item.action==='up'?-1:1,id);}
function startDrag(event,row){if(!row.parent)return;context.value=null;dragged.value=row.node.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-lvgl-node',row.node.id);}
function dragOver(event,target,inside=false){
 if(!dragged.value)return;const rect=event.currentTarget.getBoundingClientRect(),ratio=(event.clientY-rect.top)/rect.height;
 const placement=inside?'inside':ratio<.25?'before':ratio>.75?'after':isTreeContainer(target)?'inside':'after';
 const valid=canMoveNodeTo(props.modelValue.root,dragged.value,target.id,placement);event.dataTransfer.dropEffect=valid?'move':'none';
 if(valid){event.preventDefault();dropTarget.value={id:target.id,placement};}else dropTarget.value=null;
}
function endDrag(){dragged.value='';dropTarget.value=null;}
function drop(event){event.preventDefault();event.stopPropagation();const target=dropTarget.value,id=dragged.value;if(target){const doc=clone(props.modelValue);if(moveNodeTo(doc.root,id,target.id,target.placement)){emit('update:modelValue',doc);emit('update:selected',id);}}endDrag();}
</script>
<template>
 <div class="screen-editor-workspace">
 <EditorTransfers kind="screen" :document="modelValue" @import="importDocument"/>
 <div ref="editor" class="screen-editor" :style="{'--screen-tree-width':treeWidth+'px'}">
  <section class="screen-tree-panel panel" aria-label="Дерево экрана">
   <div class="panel-head"><h2>Дерево экрана</h2></div>
   <div class="screen-tree-tools">
    <div class="screen-toolbar screen-name"><label>Название <input aria-label="Название экрана" :value="modelValue.name" @change="edit(doc=>doc.name=$event.target.value)"></label></div>
    <div class="screen-toolbar screen-add-component"><select v-model="addType" aria-label="Добавляемый виджет"><option value="" disabled>Добавить компонент…</option><optgroup label="С платы · пользовательские" v-if="nativeFamilies.length"><option v-for="family in nativeFamilies" :key="family.name" :value="family.name">{{family.title??family.name}} · {{family.name}}</option></optgroup><optgroup label="Стандартные LVGL"><option v-for="family in standardFamilies" :key="family.name" :value="family.name">{{family.name}}</option></optgroup></select><button class="action-button icon-action primary" :disabled="!addType" aria-label="Добавить компонент" data-tooltip="Вставить выбранный компонент в экран" @click="add()"><Icon name="plus"/></button></div>
   </div>
   <div class="screen-tree" role="tree" aria-label="Компоненты экрана" @contextmenu.self="openContext($event,modelValue.root.id)" @dragover.self="dragOver($event,modelValue.root,true)" @drop.self="drop"><button v-for="row in rows" :key="row.node.id" role="treeitem" :aria-level="row.depth+1" :aria-selected="row.node.id===node.id" :draggable="!!row.parent" :class="{selected:row.node.id===node.id,dragging:dragged===row.node.id,['drop-'+dropTarget?.placement]:dropTarget?.id===row.node.id}" :style="{'--node-depth':row.depth}" data-tooltip="ПКМ — добавить компонент или стиль. Перетаскивание — изменить порядок и родителя." @click="emit('update:selected',row.node.id)" @contextmenu="openContext($event,row.node.id)" @keydown.shift.f10.prevent="openContext($event,row.node.id)" @dragstart="startDrag($event,row)" @dragover="dragOver($event,row.node)" @dragleave="!$event.currentTarget.contains($event.relatedTarget)&&(dropTarget=null)" @drop="drop" @dragend="endDrag"><span>{{row.node.children?.length?'▾':'·'}}</span><code>{{row.node.id}}</code><small>{{row.node.type}}</small></button></div>
   <p v-if="capabilities?.source==='offline-cache'" class="screen-runtime-note">Каталог сохранён с платы · офлайн</p>
   <div class="screen-toolbar screen-tree-actions"><button class="action-button icon-action" :disabled="!selectedRow.parent" aria-label="Удалить компонент" data-tooltip="Удалить выбранный компонент" @click="remove()"><Icon name="trash"/></button><button class="action-button icon-action" :disabled="!selectedRow.parent" aria-label="Выше в дереве" data-tooltip="Переместить компонент выше среди соседей" @click="reorder(-1)"><Icon name="arrow-up"/></button><button class="action-button icon-action" :disabled="!selectedRow.parent" aria-label="Ниже в дереве" data-tooltip="Переместить компонент ниже среди соседей" @click="reorder(1)"><Icon name="arrow-down"/></button></div>
  </section>
  <button class="pane-divider screen-tree-divider" role="separator" aria-label="Ширина дерева экрана" aria-orientation="vertical" :aria-valuenow="treeWidth" aria-valuemin="160" :aria-valuemax="Math.max(160,(editor?.clientWidth??700)-320)" data-tooltip="Перетащите для изменения ширины дерева. Клавиши ← и → меняют ширину на 20 px." @pointerdown="startTreeResize" @keydown.left.prevent="resizeTree(treeWidth-20)" @keydown.right.prevent="resizeTree(treeWidth+20)"></button>
  <section class="screen-properties-panel panel" aria-label="Свойства компонента">
   <div class="panel-head"><h2>Свойства · {{node.id}}</h2><code>{{node.type}}</code></div>
   <div class="screen-properties-scroll">
    <p v-if="message" class="bad" role="alert">{{message}}</p>
    <ScreenNodeProperties :model-value="node" :screen="modelValue" :parent="selectedRow.parent" :resources="resources" :screen-styles="Object.keys(modelValue.styles??{})" @update:model-value="updateNode" @invalid="message=$event"/>
    <details class="style-source"><summary>JSON экрана</summary><pre>{{JSON.stringify(modelValue,null,2)}}</pre></details>
   </div>
  </section>
 </div>
 <ContextMenu v-if="context" :key="context.id+':'+context.x+':'+context.y" :x="context.x" :y="context.y" :items="contextItems" :label="'Действия: '+context.id" @select="contextCommand" @close="context=null"/>
 </div>
</template>
