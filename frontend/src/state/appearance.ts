import {reactive,watch} from 'vue';
const defaults={theme:'cream',density:'nano',language:'ru',collapsed:false,tooltips:true};
let saved={};try{saved=JSON.parse(localStorage.getItem('lvgl-cbor-style-lab')??'{}')}catch{}
export const appearance=reactive({...defaults,...saved});
if(!['cream','dark','emerald','light'].includes(appearance.theme))appearance.theme='cream';
if(!['nano','mini','norm'].includes(appearance.density))appearance.density='nano';
if(!['ru','en'].includes(appearance.language))appearance.language='ru';
if(typeof appearance.tooltips!=='boolean')appearance.tooltips=true;
watch(appearance,value=>{document.documentElement.dataset.theme=value.theme;document.documentElement.dataset.density=value.density;document.documentElement.dataset.tooltips=value.tooltips?'on':'off';document.documentElement.lang=value.language;localStorage.setItem('lvgl-cbor-style-lab',JSON.stringify(value));},{immediate:true});
export function t(ru:string,en:string){return appearance.language==='ru'?ru:en;}
