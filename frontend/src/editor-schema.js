// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {styleFields,styleGroups} from './generated/style-fields.js';
export const editorSections=[
 {id:'geometry',name:'Геометрия',ids:['size','position','transform','padding','margin']},
 {id:'appearance',name:'Оформление',ids:['background','background-image','border','outline','shadow']},
 {id:'graphics',name:'Графика и текст',ids:['image','line','arc','text']},
 {id:'effects',name:'Эффекты и анимация',ids:['effects','animation']},
 {id:'layout',name:'Компоновка',ids:['layout','flex','grid']}
];
export const editorGroups=styleGroups.map(group=>({...group,fields:styleFields.filter(field=>field.group===group.id)}));
export function filterEditorGroups(groups,values,{query='',onlyActive=false,group='all'}={}){
 const search=query.toLowerCase();
 return groups.filter(g=>group==='all'||g.id===group).map(g=>({...g,fields:g.fields.filter(f=>
  (!onlyActive||Object.hasOwn(values,f.name))&&(!search||[f.name,f.label,f.type].join(' ').toLowerCase().includes(search))
 )})).filter(g=>g.fields.length);
}
export function combinedGroupIds(groups){
 const ids=groups.map(g=>g.id),edge=ids.find(id=>['border','outline','shadow'].includes(id));
 return ids.filter(id=>(id!=='margin'||!ids.includes('padding'))&&(!['border','outline','shadow'].includes(id)||id===edge));
}
