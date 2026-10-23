import {ref,computed,watch} from 'vue';
import {createScreen,createBlankScreen,validateScreen,clone,findNode} from '../screen-model.js';
import {recoverableNativeDraft} from '../modules/native-widgets/draft-recovery.js';
import {screenViews} from '@lvgl-cbor/screen-codec';
export function useScreenWorkspace(capabilities,{documents,entry,preserveSelection}={}){
 let initial;const warning=ref(''),nativeWarning='Сохранены экраны с недоступными нативными типами. Для применения нужна подходящая прошивка.';
 if(!documents)try{const saved=localStorage.getItem('lvgl-cbor-screens-draft-1');if(saved){initial=JSON.parse(saved);if(!Array.isArray(initial)||!initial.length||initial.some(doc=>{if(!validateScreen(doc,capabilities?.value).length)return false;if(!recoverableNativeDraft(doc))return true;warning.value=nativeWarning;return false;}))throw Error('Некорректные сохранённые экраны');}}catch{initial=undefined;warning.value='Сохранённый документ не прочитан. Исходная запись оставлена в localStorage до следующего изменения.';}
 const screens=documents??ref(initial??[createScreen()]);
 const preferred=()=>screens.value.find(doc=>doc.id===entry?.value);
 const initialScreen=preferred()??screens.value[0],screenId=ref(initialScreen.id),selected=ref(initialScreen.root.id),deleted=ref(null);
 const current=computed(()=>screens.value.find(doc=>doc.id===screenId.value)??screens.value[0]);
 if(!documents)watch(screens,value=>{try{localStorage.setItem('lvgl-cbor-screens-draft-1',JSON.stringify(value));}catch{warning.value='Не удалось сохранить экраны в браузере. Экспортируйте JSON.';}},{deep:true});
 watch(screens,()=>{if(preserveSelection?.value&&screens.value.some(doc=>doc.id===screenId.value)){if(!findNode(current.value,selected.value))selected.value=current.value.root.id;return;}const startup=preferred();if(startup)screenId.value=startup.id;else if(!screens.value.some(doc=>doc.id===screenId.value))screenId.value=screens.value[0].id;selected.value=current.value.root.id;});
 watch(screenId,()=>selected.value=current.value.root.id);
 watch(screens,()=>{if(warning.value===nativeWarning&&screens.value.every(doc=>!validateScreen(doc,capabilities?.value).length))warning.value='';},{deep:true});
 function update(doc){const index=screens.value.findIndex(s=>s.id===current.value.id);if(screens.value.some((s,i)=>i!==index&&s.id===doc.id)){warning.value='Экран с ID '+doc.id+' уже существует';return;}screens.value.splice(index,1,doc);screenId.value=doc.id;}
 function add({blank=false}={}){let n=1;while(screens.value.some(s=>s.id==='screen_'+n))n++;const doc=(blank?createBlankScreen:createScreen)('screen_'+n,'Экран '+n);screens.value.push(doc);screenId.value=doc.id;}
 function remove(id=current.value.id){if(screens.value.length<=1)return;const index=screens.value.findIndex(s=>s.id===id);if(index<0)return;const users=screens.value.filter(screen=>screen.id!==id&&screenViews(screen).some(view=>view.pages.some(page=>page.screen===id)));if(users.length){warning.value='Страница используется в контейнерах: '+users.map(screen=>screen.name).join(', ')+'. Сначала удалите ссылки.';return false;}deleted.value={doc:screens.value[index],index};screens.value.splice(index,1);if(screenId.value===id)screenId.value=screens.value[Math.min(index,screens.value.length-1)].id;}
 function rename(id,name){const doc=screens.value.find(s=>s.id===id);if(doc&&name.trim())doc.name=name.trim();}
 function duplicate(id){const doc=screens.value.find(s=>s.id===id);if(doc)addDocument({...doc,name:doc.name+' · копия'});}
 function undo(){if(!deleted.value)return;const {doc,index}=deleted.value;if(screens.value.some(s=>s.id===doc.id)){warning.value='Невозможно вернуть экран: ID уже занят';return;}screens.value.splice(index,0,doc);screenId.value=doc.id;deleted.value=null;}
 function addDocument(source){const doc=clone(source);let suffix=1;while(screens.value.some(s=>s.id===doc.id))doc.id=source.id+'_'+suffix++;screens.value.push(doc);screenId.value=doc.id;}
 return {screens,screenId,selected,current,warning,deleted,update,add,addDocument,remove,undo,rename,duplicate};
}
