// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {ref,computed,provide} from 'vue';
import {createSimulator} from '../simulator.js';
import {useScreenWorkspace} from './screen-workspace.js';
import {provideScreenPreviewSettings} from './screen-preview-settings.js';
import {useStyleWorkspace} from './style-workspace.js';
import {useDeviceConnection} from './device-connection.js';
import {usePreviewWorkspace} from './preview-workspace.js';
import {usePaneResize} from './pane-resize.js';
import {useStyleController} from './style-controller.js';
import {useScreenController} from './screen-controller.js';
import {useAuthoringCapabilities} from '../modules/native-widgets/authoring-capabilities.js';
import {useProjectWorkspace} from './project-workspace.js';
import {useProjectController} from './project-controller.js';
import {usePagePreview} from './page-preview.js';
import {useLiveData} from './live-data.js';

export function useLab(){
 provideScreenPreviewSettings();
 const appRoute=['/','/index.html'].includes(location.pathname),simulated=new URLSearchParams(location.search).get('sim')==='1';
 const local=['localhost','127.0.0.1'].includes(location.hostname),page=ref('project');
 let savedDevice='';try{savedDevice=localStorage.getItem('lvgl-cbor-device')??'';}catch{}
 const device=ref(simulated?'http://127.0.0.1':local?savedDevice:location.origin),simulator=simulated?createSimulator():null;
 const connection=useDeviceConnection({device,simulator,local,enabled:appRoute});
 const authoringCapabilities=useAuthoringCapabilities(connection.capabilities);
 provide('lvgl-authoring-capabilities',authoringCapabilities);
 const projectWorkspace=useProjectWorkspace(authoringCapabilities);
 const screenWorkspace=useScreenWorkspace(authoringCapabilities,{documents:projectWorkspace.screenDocuments,entry:computed(()=>projectWorkspace.project.value.manifest.entry),preserveSelection:projectWorkspace.preserveSelection}),workspace=useStyleWorkspace({document:projectWorkspace.styleDoc});
 const preview=usePreviewWorkspace(workspace.styleDoc,page,screenWorkspace),pane=usePaneResize(page),pagePreview=usePagePreview(projectWorkspace.project,screenWorkspace.current,connection.capabilities);
 provide('lvgl-capabilities',connection.capabilities);
 const projects=useProjectController(connection,projectWorkspace,{...preview,pagePreview,currentScreen:()=>screenWorkspace.current.value});
 provide('lvgl-project',{workspace:projectWorkspace,controller:projects,pagePreview});
 const liveData=useLiveData(connection);provide('lvgl-live-data',liveData);
 let screens;
 const styles=useStyleController(connection,{document:workspace.styleDoc,page,auto:workspace.autoStyle,preview,simulator,projectPreview:projects.previewStyle,suspended:projectWorkspace.loading,otherBusy:()=>screens?.screenBusy.value,onEvent:event=>{projects.projectChanged(event);liveData.event(event);},onOnline:projects.socketOnline,onSocketState:liveData.socketState});
 screens=useScreenController(connection,{document:screenWorkspace.current,page,auto:workspace.autoScreen,simulated,projectPreview:projects.previewScreen,suspended:projectWorkspace.loading,previewKey:pagePreview.target,otherBusy:()=>styles.busy.value||styles.componentBusy.value});
 const activeAuto=computed({get:()=>page.value==='screens'?workspace.autoScreen.value:workspace.autoStyle.value,set:value=>{if(page.value==='screens')workspace.autoScreen.value=value;else workspace.autoStyle.value=value;}});
 return {appRoute,simulated,page,device,screenWorkspace,...workspace,...preview,...pane,...connection,...styles,...screens,activeAuto,
  screens:screenWorkspace.screens,screenId:screenWorkspace.screenId,screenSelection:screenWorkspace.selected,currentScreen:screenWorkspace.current,screenWarning:screenWorkspace.warning,deletedScreen:screenWorkspace.deleted,
  error:computed(()=>styles.error.value||connection.capabilitiesError.value),preview:styles.check};
}
