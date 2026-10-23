<script setup>
import {computed,nextTick,onBeforeUnmount,onMounted,ref} from 'vue';
import Icon from './Icon.vue';
const props=defineProps({items:{type:Array,required:true},x:Number,y:Number,label:{type:String,default:'Действия'}}),emit=defineEmits(['select','close']);
const panels=ref([]),position=ref({left:props.x,top:props.y}),branch=ref(null),branchPosition=ref({left:0,top:0});
const menus=computed(()=>[{items:props.items,position:position.value},...(branch.value?[{items:branch.value.item.children,position:branchPosition.value}]:[])]);
let returnFocus;
const buttons=panel=>Array.from(panel?.querySelectorAll('button:not(:disabled)')??[]);
function close(){emit('close');}
function clamp(panel,x,y){const rect=panel.getBoundingClientRect();return {left:Math.max(8,Math.min(x,innerWidth-rect.width-8)),top:Math.max(8,Math.min(y,innerHeight-rect.height-8))};}
async function expand(item,button,focus=false){
 if(item.disabled)return;
 branch.value={item,button};await nextTick();const panel=panels.value[1];if(!panel)return;
 const parent=panels.value[0].getBoundingClientRect(),rect=panel.getBoundingClientRect(),row=button.getBoundingClientRect();
 branchPosition.value=clamp(panel,parent.right+rect.width+8<=innerWidth?parent.right-1:parent.left-rect.width+1,row.top);
 if(focus)buttons(panel)[0]?.focus();
}
function choose(item,event){if(item.disabled)return;if(item.children)return expand(item,event.currentTarget,true);emit('select',item);close();}
function hover(item,event,level){if(level)return;if(item.children)void expand(item,event.currentTarget);else branch.value=null;}
function key(event,item,level){
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
 if(event.key==='ArrowRight'&&item.children){event.preventDefault();void expand(item,event.currentTarget,true);return;}
 if(event.key==='ArrowLeft'&&level){event.preventDefault();const button=branch.value?.button;branch.value=null;button?.focus();return;}
 if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
  event.preventDefault();const entries=buttons(panels.value[level]),index=entries.indexOf(event.currentTarget);
  entries[event.key==='Home'?0:event.key==='End'?entries.length-1:(index+(event.key==='ArrowUp'?-1:1)+entries.length)%entries.length]?.focus();
 }
 if(event.key==='Tab')close();
}
function outside(event){if(!panels.value.some(panel=>panel?.contains(event.target)))close();}
function scroll(event){if(!panels.value.some(panel=>panel?.contains(event.target)))close();}
onMounted(async()=>{returnFocus=document.activeElement;await nextTick();position.value=clamp(panels.value[0],props.x,props.y);buttons(panels.value[0])[0]?.focus();document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);window.addEventListener('scroll',scroll,true);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);window.removeEventListener('scroll',scroll,true);if(returnFocus?.isConnected)returnFocus.focus();});
</script>
<template><Teleport to="body"><div v-for="(menu,level) in menus" :key="level" :ref="element=>panels[level]=element" class="context-menu" role="menu" :aria-label="level?branch.item.label:label" :style="{left:menu.position.left+'px',top:menu.position.top+'px'}" @contextmenu.prevent>
 <template v-for="(item,index) in menu.items" :key="item.key??index">
  <hr v-if="item.separator" role="separator">
  <div v-else-if="item.heading" class="context-menu-heading">{{item.heading}}</div>
  <button v-else role="menuitem" :disabled="item.disabled" :aria-haspopup="item.children?'menu':undefined" :aria-expanded="item.children?branch?.item.label===item.label:undefined" :data-tooltip="item.hint" @click="choose(item,$event)" @mouseenter="hover(item,$event,level)" @keydown="key($event,item,level)"><Icon v-if="item.icon" :name="item.icon"/><span v-else class="context-menu-icon-space"></span><span class="context-menu-label">{{item.label}}</span><Icon v-if="item.children" name="chevron-right"/></button>
 </template>
</div></Teleport></template>
<style>
.context-menu {position:fixed;z-index:3000;min-width:210px;max-width:min(370px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;padding:3px;border:1px solid var(--lu-input-border);background:var(--lu-bg-canvas);box-shadow:0 3px 8px #0003;font:13px/1.25 'Segoe UI',sans-serif;color:var(--lu-text);}
.context-menu button {display:flex;align-items:center;gap:7px;width:100%;min-height:27px;padding:3px 6px;text-align:left;border-radius:0;}
.context-menu button:focus,.context-menu button:hover {background:var(--lu-primary-light);outline:none;}
.context-menu button>.ti,.context-menu-icon-space {width:17px;flex-shrink:0;font-size:17px;}
.context-menu-label {flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.context-menu-heading {padding:4px 7px 2px;color:var(--lu-text-muted);font-size:12px;}
.context-menu hr {margin:3px 0;border:0;border-top:1px solid var(--lu-border);}
</style>
