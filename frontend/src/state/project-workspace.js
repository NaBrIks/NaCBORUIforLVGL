import {ref,computed,watch,nextTick} from 'vue';
import {createProject,recompileProjectAuthoring} from '../../../packages/project-codec/index.js';
import {createScreen,clone,validateScreen} from '../screen-model.js';
import {readSaved,save} from './persistence.js';
import {recoverableNativeDraft} from '../modules/native-widgets/draft-recovery.js';

const key='lvgl-cbor-project-1';
export function useProjectWorkspace(capabilities){
 const warning=ref(''),loading=ref(false),source=ref('Черновик браузера'),preserveSelection=ref(false);
 let initial=readSaved(key,null);
 if(initial)try{
  if(initial.manifest?.requirements?.screenABI){const fingerprint=capabilities?.value?.screen?.sha256;if(fingerprint&&initial.manifest.requirements.screenABI!==fingerprint)save(key+'-before-contract-recompile',initial);}
  const result=recompileProjectAuthoring(initial,capabilities?.value);initial=result.project;if(result.migrated){const preserved=save(key+'-before-contract-recompile',readSaved(key,initial));warning.value='Черновик перекомпилирован по текущему контракту. '+(preserved?'Исходная копия сохранена; ':'Резервная копия не записана; исходная запись остаётся до следующей правки. ')+'Совместимость с МК проверяется при применении.';}
 }catch(error){
  const preserved=save(key+'-before-contract-recompile',initial);
  const screens=Object.values(initial.screens??{});
  if(initial.format==='lvgl-project-1'&&initial.manifest?.id&&screens.length&&screens.every(doc=>!validateScreen(doc,capabilities?.value).length||recoverableNativeDraft(doc)))warning.value='Проект сохранён как черновик: '+error.message;
  else{initial=null;warning.value='Сохранённый проект не прочитан. Исходная запись оставлена до следующей правки.';}
  if(!preserved)warning.value+=' Резервная копия не записана.';
 }
 if(!initial){
  const savedScreens=readSaved('lvgl-cbor-screens-draft-1',null),screens=Array.isArray(savedScreens)&&savedScreens.length?savedScreens:[createScreen()];
  const oldStyle=readSaved('lvgl-cbor-style-doc',null),style={...(oldStyle??{name:'demo',props:{bg_color:'#173344',bg_opa:255,text_color:'#ffffff',pad_all:12}}),scope:'global',attach:false};
  initial=createProject(screens,{styles:{[style.name]:style}});
 }
 const project=ref(initial),screenDocuments=ref(Object.values(initial.screens)),styleId=ref(Object.keys(initial.styles)[0]??'');
 const emptyStyle={scope:'global',name:'style',props:{},attach:false};
 function renameReferences(oldName,newName){
  const rewrite=ref=>['global:'+oldName,'global-dynamic:'+oldName].includes(ref)?ref.slice(0,ref.indexOf(':')+1)+newName:ref;
  const rewriteDefinition=style=>{if(style.copy)style.copy=rewrite(style.copy);if(style.merge)style.merge=style.merge.map(rewrite);};
  for(const style of Object.values(project.value.styles))rewriteDefinition(style);
  for(const screen of screenDocuments.value)for(const style of Object.values(screen.styles??{}))rewriteDefinition(style);
  const walk=node=>{for(const use of node.styles??[])use.ref=rewrite(use.ref);for(const child of node.children??[])walk(child);};for(const screen of screenDocuments.value)walk(screen.root);
 }
 const styleDoc=computed({get:()=>project.value.styles[styleId.value]??emptyStyle,set:doc=>{
  const old=styleId.value,name=doc.name;
  if(!name||Object.hasOwn(project.value.styles,name)&&name!==old){warning.value='Имя стиля уже занято или пусто';return;}
  if(old&&name!==old){renameReferences(old,name);delete project.value.styles[old];}
  project.value.styles={...project.value.styles,[name]:{...doc,scope:'global',attach:false}};styleId.value=name;
 }});
 const styleUses=computed(()=>{
  const counts=Object.create(null);const count=ref=>{const match=/^(global|global-dynamic):(.+)$/.exec(ref??'');if(match)counts[match[2]]=(counts[match[2]]??0)+1;};
  const definition=style=>{count(style.copy);for(const ref of style.merge??[])count(ref);};
  for(const style of Object.values(project.value.styles))definition(style);
  const walk=node=>{for(const use of node.styles??[])count(use.ref);for(const child of node.children??[])walk(child);};
  for(const screen of screenDocuments.value){for(const style of Object.values(screen.styles??{}))definition(style);walk(screen.root);}return counts;
 });
 watch(screenDocuments,docs=>{project.value.screens=Object.fromEntries(docs.map(doc=>[doc.id,doc]));if(!Object.hasOwn(project.value.screens,project.value.manifest.entry))project.value.manifest.entry=docs[0]?.id??'';},{deep:true,flush:'sync'});
 watch(project,value=>{if(!save(key,value))warning.value='Не удалось сохранить черновик браузера. Сохраните проект в файл.';},{deep:true});
 async function replace(document,origin,{preserveSelection:keep=false}={}){loading.value=true;preserveSelection.value=keep;project.value=clone(document);screenDocuments.value=Object.values(project.value.screens);if(!keep||!Object.hasOwn(project.value.styles,styleId.value))styleId.value=Object.keys(project.value.styles)[0]??'';source.value=origin;warning.value='';await nextTick();preserveSelection.value=false;loading.value=false;}
 function addStyle(source){let n=1;while(Object.hasOwn(project.value.styles,'style_'+n))n++;const name='style_'+n;project.value.styles={...project.value.styles,[name]:{...(source?clone(source):{}),scope:'global',name,props:source?clone(source.props??{}):{},attach:false}};styleId.value=name;return name;}
 function duplicateStyle(name=styleId.value){const source=project.value.styles[name];if(source)return addStyle(source);}
 function removeStyle(name=styleId.value){if(styleUses.value[name]){warning.value='Стиль '+name+' используется в проекте. Сначала снимите ссылки на него.';return false;}if(!Object.hasOwn(project.value.styles,name))return false;delete project.value.styles[name];if(styleId.value===name)styleId.value=Object.keys(project.value.styles)[0]??'';warning.value='';return true;}
 return {project,screenDocuments,styleId,styleDoc,styleUses,loading,preserveSelection,source,warning,replace,addStyle,duplicateStyle,removeStyle};
}
