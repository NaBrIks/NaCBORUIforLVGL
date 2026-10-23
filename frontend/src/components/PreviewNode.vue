<script setup>
import {computed,inject} from 'vue';
import {useRuntimeCapabilities} from '../state/runtime-capabilities.js';
import '../modules/native-widgets/native-widgets.css';
import {effectiveProps,effectiveFlags} from '../screen-model.js';
import {previewStyle,resolvedStyle,layoutName} from '../preview-style';
const props=defineProps({node:{type:Object,required:true},screen:Object,instance:Object,root:Boolean,mounted:Boolean,mountSizing:String,parentLayout:{type:String,default:'LV_LAYOUT_NONE'},selected:String,showHidden:Boolean,hiddenAncestor:Boolean});
const emit=defineEmits(['select']);
const {families}=useRuntimeCapabilities();
const project=inject('lvgl-project',null),projectStyles=computed(()=>project?.workspace.project.value.styles??{});
const family=computed(()=>families.value.find(w=>w.name===props.node.type&&w.abi));
const custom=computed(()=>!!family.value||props.node.type.includes(':'));
const composition=inject('lvgl-composition-preview',null),states=computed(()=>composition?.composition.value.checked(props.instance,props.node)?['CHECKED']:[]);
const style=computed(()=>{const value=previewStyle(props.node,{...props,states:states.value,projectStyles:projectStyles.value,nativeSize:family.value?.preview});if(props.mounted&&props.mountSizing==='design'){value.width=props.screen.size.width+'px';value.height=props.screen.size.height+'px';}return value;});
const slot=computed(()=>props.instance?.views[props.node.id]),selectedHere=computed(()=>composition?composition.selection.value?.instance===props.instance?.id&&composition.selection.value?.node===props.node.id:props.selected===props.node.id);
function click(){const navigation=props.node.events?.find(rule=>rule.event==='clicked'&&rule.navigate);if(composition&&props.instance){if(composition.interactive.value&&navigation){composition.navigate(props.instance,navigation.navigate);return;}composition.select(props.instance,props.node.id);}else emit('select',props.node.id);}
const hiddenBranch=computed(()=>props.hiddenAncestor||effectiveFlags(props.node).HIDDEN===true);
const values=computed(()=>resolvedStyle(props.node,props.screen,projectStyles.value,states.value));
const fraction=computed(()=>Math.max(0,Math.min(1,((props.node.props?.value??0)-(props.node.props?.min??0))/Math.max(1,(props.node.props?.max??100)-(props.node.props?.min??0)))));
const content=computed(()=>effectiveProps(props.node));
const imageSrc=computed(()=>{const src=content.value.src??'';return /^(data:image\/(png|jpeg|webp|gif);base64,|blob:)/.test(src)?src:'';});
</script>
<template>
  <div class="lv-preview-node" :class="['preview-'+node.type,{'preview-selected':selectedHere,'preview-root':root}]" :style="style" :data-node-id="node.id" :data-instance-id="instance?.id" :data-checked="states.includes('CHECKED')||undefined" @click.stop="click">
  <div v-if="custom" class="preview-native-placeholder"><strong>{{family?.title??node.type}}</strong><small>{{node.type}} · native / S3</small><small>{{node.style?.width??family?.preview?.width??'?'}} × {{node.style?.height??family?.preview?.height??'?'}}</small></div>
  <span v-else-if="['label','button','textarea'].includes(node.type)" class="preview-text">{{content.text??''}}</span>
  <div v-else-if="['bar','slider'].includes(node.type)" class="preview-track"><div class="preview-fill" :style="{width:fraction*100+'%'}"></div><i v-if="node.type==='slider'" class="preview-knob" :style="{left:fraction*100+'%'}"></i></div>
  <svg v-else-if="node.type==='arc'" class="preview-shape" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#52616a" :stroke-width="values.arc_width??8"/><circle cx="50" cy="50" r="40" fill="none" :stroke="values.arc_color??'#25b38a'" :stroke-width="values.arc_width??8" :stroke-opacity="(values.arc_opa??255)/255" :stroke-dasharray="`${fraction*251.33} 251.33`" transform="rotate(90 50 50)"/></svg>
  <svg v-else-if="node.type==='line'" class="preview-shape"><polyline :points="(content.points??[]).map(p=>p.join(',')).join(' ')" fill="none" :stroke="values.line_color??'#25b38a'" :stroke-width="values.line_width??3" :stroke-opacity="(values.line_opa??255)/255" :stroke-linecap="values.line_rounded?'round':'butt'"/></svg>
  <template v-else-if="node.type==='image'"><img v-if="imageSrc" class="preview-shape" :src="imageSrc" alt=""><span v-else class="preview-resource">▧ {{content.src||'image'}}</span></template>
  <span v-else-if="node.type==='checkbox'" class="preview-choice"><i>{{content.checked?'✓':''}}</i>{{content.text}}</span>
  <span v-else-if="node.type==='switch'" class="preview-switch" :class="{checked:content.checked}"><i></i></span>
  <span v-else-if="node.type==='dropdown'" class="preview-choice">{{content.options?.[content.selected??0]??'—'}} ▾</span>
   <PreviewNode v-for="child in node.children??[]" :key="child.id" :node="child" :screen="screen" :instance="instance" :parent-layout="layoutName(values.layout)" :show-hidden="showHidden" :hidden-ancestor="hiddenBranch" :selected="selected" @select="emit('select',$event)"/>
   <div v-if="node.view" class="preview-view-host"><PreviewNode v-if="slot?.child" :key="slot.child.id" :node="slot.child.screen.root" :screen="slot.child.screen" :instance="slot.child" root mounted :mount-sizing="node.view.sizing??'fill'" :show-hidden="showHidden" :hidden-ancestor="hiddenBranch"/><div v-else class="preview-view-error" role="status" :title="slot?.error??'Вложенная страница недоступна'">✕ {{slot?.selected??node.view.initial}}<small>{{slot?.error}}</small></div></div>
 </div>
</template>
