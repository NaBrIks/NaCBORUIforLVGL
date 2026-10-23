import {computed,ref,watch} from 'vue';
import {pagePreviewTargets,buildPagePreview} from '../modules/composition/page-preview.js';

export function usePagePreview(project,screen,capabilities){
 const target=ref('standalone');
 const targets=computed(()=>pagePreviewTargets(project.value,screen.value.id,capabilities.value));
 watch(()=>screen.value.id,()=>{target.value='standalone';},{flush:'sync'});
 watch(targets,list=>{if(!list.some(item=>item.key===target.value))target.value='standalone';});
 const selected=computed(()=>targets.value.find(item=>item.key===target.value)??targets.value[0]);
 const browser=computed(()=>buildPagePreview(project.value,screen.value.id,selected.value));
 function device(){const size=capabilities.value?.display??project.value.screens[project.value.manifest.entry]?.size;return buildPagePreview(project.value,screen.value.id,selected.value,size);}
 return {target,targets,browser,device};
}
