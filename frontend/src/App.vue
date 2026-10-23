<script setup>
import {appearance} from './state/appearance';
import {useLab} from './state/lab.js';
import {screenExamples} from './screen-examples';
import LabHeader from './components/LabHeader.vue';
import LabNavigation from './components/LabNavigation.vue';
import DeviceConnectionBar from './components/DeviceConnectionBar.vue';
import DeviceInfo from './components/DeviceInfo.vue';
import ProjectStylesEditor from './components/ProjectStylesEditor.vue';
import DeviceTasks from './components/DeviceTasks.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import PreviewActions from './components/PreviewActions.vue';
import ScreenEditor from './components/ScreenEditor.vue';
import ScreenManager from './components/ScreenManager.vue';
import WorkspaceSourceInfo from './components/WorkspaceSourceInfo.vue';
import ProjectPage from './components/ProjectPage.vue';
const {appRoute,simulated,page,device,screenWorkspace,screens,screenId,screenSelection,currentScreen,screenWarning,deletedScreen,
 styleDoc,autoStyle,previewSettings,componentType,componentText,componentScreen,resizePreview,
 columns,inspectorWidth,inspectorMin,inspectorMax,startResize,setInspectorWidth,
 info,httpOnline,httpError,sameContract,connect,online,wsStatus,connectionNote,
 busy,componentBusy,error,reply,hex,decoded,observed,canApply,styleCheckResult,send,preview,
 screenBusy,screenResult,screenCanApply,checkScreen,sendScreen,activeAuto}=useLab();
</script>
<template><div v-if="appRoute" class="app-shell" :class="{collapsed:appearance.collapsed}">
<LabHeader :online="online" :http-online="httpOnline" :http-error="httpError" :ws-status="wsStatus" :connection-note="connectionNote"><DeviceConnectionBar v-model:device="device" :simulated="simulated" :info="info" :http-online="httpOnline" @connect="connect"/></LabHeader>
<LabNavigation v-model:page="page" :screens="screens" :screen-id="screenId" @select-screen="screenId=$event;page='screens'"/>
<div class="workspace">
<div ref="columns" class="lab-columns" :class="{'editor-columns':page==='styles'||page==='screens','screen-manager-columns':page==='project'||page==='screen-manager'}" :style="{'--inspector-width':inspectorWidth+'px','--inspector-min-width':inspectorMin+'px'}"><main class="lab-main" :class="{'screen-main':page==='screens','styles-main':page==='styles','screen-manager-main':page==='screen-manager'}">
<WorkspaceSourceInfo v-if="page==='styles'||page==='screens'"/>
<DeviceInfo v-if="page==='info'" :info="info" :http-online="httpOnline" :same-contract="sameContract"/>
<ProjectPage v-else-if="page==='project'"/>
<ProjectStylesEditor v-else-if="page==='styles'" :observed="observed" :resources="info?.resources??[]" :can-apply="canApply&&!screenBusy" :auto-apply="autoStyle" :hex="hex" :decoded="decoded" :reply="reply" @apply="send"/>
<template v-else-if="page==='screen-manager'"><ScreenManager :screens="screens" :screen-id="screenId" :deleted-screen="deletedScreen" @select="screenId=$event" @open="screenId=$event;page='screens'" @add="screenWorkspace.add()" @add-blank="screenWorkspace.add({blank:true});page='screens'" @add-example="screenWorkspace.addDocument(screenExamples[$event])" @remove="screenWorkspace.remove" @undo="screenWorkspace.undo()" @rename="screenWorkspace.rename" @duplicate="screenWorkspace.duplicate"/><p v-if="screenWarning" class="bad" role="alert">{{screenWarning}}</p></template>
<template v-else><ScreenEditor :model-value="currentScreen" v-model:selected="screenSelection" :resources="info?.resources??[]" @update:model-value="screenWorkspace.update"/><p v-if="screenWarning" class="bad" role="alert">{{screenWarning}}</p></template>
<p v-if="error&&page!=='screens'" class="bad" role="alert">{{error}}</p></main>
<DeviceTasks v-if="page==='info'" :tasks="info?.tasks??[]" :online="httpOnline" :language="appearance.language"/>
<template v-else-if="page!=='project'&&page!=='screen-manager'"><button class="pane-divider" role="separator" aria-label="Ширина редактора и предпросмотра" aria-orientation="vertical" :aria-valuenow="inspectorWidth" :aria-valuemin="inspectorMin" :aria-valuemax="inspectorMax" @pointerdown="startResize" @keydown.left.prevent="setInspectorWidth(inspectorWidth-20)" @keydown.right.prevent="setInspectorWidth(inspectorWidth+20)"></button><PreviewPanel :screen="page==='screens'?currentScreen:componentScreen" :mode="page==='screens'?'screen':'component'" v-model:settings="previewSettings" v-model:component-type="componentType" v-model:text="componentText" :selected="page==='screens'?screenSelection:undefined" @resize="resizePreview" @select="page==='screens'&&(screenSelection=$event)"><template #actions><PreviewActions :can-apply="page==='screens'?screenCanApply:canApply" :busy="busy||screenBusy||componentBusy" v-model:auto="activeAuto" :simulated="simulated" :message="page==='screens'?screenResult:styleCheckResult" @apply="page==='screens'?sendScreen():send()" @check="page==='screens'?checkScreen():preview()"/></template></PreviewPanel></template></div></div></div><main v-else class="panel"><h1>Страница не найдена</h1><a href="/">Открыть редактор</a></main></template>

