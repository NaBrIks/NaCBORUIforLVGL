import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {ProjectClient} from '../../../packages/project-codec/client.js';
import {encodeProject} from '../../../packages/project-codec/index.js';
import {clone} from '../screen-model.js';
import {useProjectFollow} from './project-follow.js';

export function useProjectController(connection,workspace,preview){
 const deviceProject=ref(null),operationBusy=ref(false),projectMessage=ref('');let disposed=false,refreshing=null,refreshAgain=false,notificationPending=false;
 const available=computed(()=>connection.ready.value&&connection.capabilities.value?.project?.format==='lvgl-project-service-1');
 const projectEvents=computed(()=>connection.capabilities.value?.project?.events?.includes('project_changed')===true);
 const client=new ProjectClient(connection.origin);
 const follow=useProjectFollow({project:workspace.project,read:()=>client.read(connection.capabilities.value),replace:project=>workspace.replace(project,'Обновлено с МК',{preserveSelection:true}),current:()=>!disposed&&available.value});
 const deviceRevision=follow.revision,projectBusy=computed(()=>operationBusy.value||follow.loading.value);
 const current=epoch=>{if(disposed||epoch!==connection.epoch.value)throw Error('cancelled');};
 const stop=connection.onReset(()=>{deviceProject.value=null;follow.reset();projectMessage.value='';notificationPending=false;refreshAgain=false;});
 async function refresh(){
  if(!available.value)return;
  if(refreshing){refreshAgain=true;return refreshing;}
  const epoch=connection.epoch.value;
  const task=(async()=>{try{const info=await client.info();current(epoch);deviceProject.value=info;if(!projectBusy.value){notificationPending=false;if(await follow.update(info))projectMessage.value='Изменения проекта подхвачены с МК. Дисплей не изменён.';}}catch(e){if(!disposed&&epoch===connection.epoch.value&&e.message!=='cancelled')projectMessage.value=e.message;}})();
  refreshing=task;try{await task;}finally{if(refreshing===task)refreshing=null;if(refreshAgain&&!disposed){refreshAgain=false;void refresh();}}
 }
 watch(available,value=>{if(value)void refresh();},{immediate:true});
 // Reuse the already-open /ws channel. Reconnect reconciles missed events once.
 function socketOnline(){notificationPending=true;void refresh();}
 function projectChanged(event){if(event.get('event')!=='project_changed'||typeof event.get('revision')!=='string'||!event.get('revision')||event.get('revision').length>32)return;notificationPending=true;void refresh();}
 watch(projectBusy,busy=>{if(!busy&&notificationPending)void refresh();});
 watch(follow.dirty,dirty=>{if(!dirty&&follow.following.value&&follow.remoteRevision.value!==deviceRevision.value)void refresh();});
 async function operation(task){if(projectBusy.value)throw Error('Операция проекта уже выполняется');operationBusy.value=true;const epoch=connection.epoch.value;try{const result=await task();current(epoch);return result;}finally{operationBusy.value=false;}}
 async function openDevice(){try{await operation(async()=>{const epoch=connection.epoch.value;if(!await connection.refresh())throw Error('Не удалось обновить возможности МК');current(epoch);const {project,revision}=await client.read(connection.capabilities.value);current(epoch);await workspace.replace(project,'Проект с МК');current(epoch);follow.anchor(revision,project);projectMessage.value='Проект загружен с МК. Дисплей не изменён.';await refresh();});}catch(e){if(e.message!=='cancelled')projectMessage.value=e.message;}}
 async function saveDevice(){try{await operation(async()=>{const epoch=connection.epoch.value;if(!deviceProject.value?.storage.writable)throw Error('Проект МК доступен только для чтения');const submitted=clone(workspace.project.value);const result=await client.save(submitted,{capabilities:connection.capabilities.value,revision:deviceRevision.value||deviceProject.value.project.revision});current(epoch);follow.anchor(result.revision,submitted);projectMessage.value=result.persistent?'Проект сохранён на МК.':'Проект сохранён в RAM МК — до перезапуска.';await refresh();});}catch(e){if(e.message!=='cancelled')projectMessage.value=e.message;}}
 async function previewScreen(){return operation(async()=>{const plan=preview.pagePreview?.device()??{project:workspace.project.value,screen:preview.currentScreen().id};const result=await client.preview(plan.project,plan.screen,{capabilities:connection.capabilities.value});await refresh();return result;});}
 async function previewStyle(){return operation(async()=>{
  const project=clone(workspace.project.value),screen=preview.componentDocument();
  let id='__style_preview__';while(Object.hasOwn(project.screens,id))id+='_';screen.id=id;
  if(workspace.styleId.value)screen.root.children[0].styles=[{ref:'global:'+workspace.styleId.value}];
  Object.defineProperty(project.screens,id,{value:screen,enumerable:true});
  const result=await client.preview(project,id,{capabilities:connection.capabilities.value});await refresh();return result;
 });}
 async function showSaved(name){try{await operation(async()=>{const epoch=connection.epoch.value;if(!name){const info=await client.info();current(epoch);deviceProject.value=info;name=info.project.entry;}await client.show(name);current(epoch);projectMessage.value='Показан сохранённый экран '+name;await refresh();});}catch(e){if(e.message!=='cancelled')projectMessage.value=e.message;}}
 function check(){encodeProject(workspace.project.value,connection.capabilities.value);}
 onBeforeUnmount(()=>{disposed=true;follow.reset();stop();});
 return {available,deviceProject,projectBusy,projectMessage,deviceRevision,projectEvents,projectChanged,socketOnline,following:follow.following,projectDirty:follow.dirty,projectConflict:follow.conflict,stopFollowing:follow.reset,openDevice,saveDevice,previewScreen,previewStyle,showSaved,check,refresh};
}
