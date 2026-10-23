import {mkdir,writeFile} from 'node:fs/promises';
import {createProject,encodeProject,decodeProject} from '../packages/project-codec/index.js';
import {createBlankScreen,createNode} from '../frontend/src/screen-model.js';
import {compileCatalog} from '../packages/project-codec/catalog.js';
import {offlineCapabilities} from '../packages/screen-codec/index.js';
import assert from 'node:assert/strict';
const directory=new URL('../local/project-fixtures/',import.meta.url);await mkdir(directory,{recursive:true});
const screen=createBlankScreen('main','Главный экран');screen.root.children.push(createNode('label','message'));screen.root.children[0].props.text='Project base';screen.root.children[0].styles=[{ref:'global:accent'}];
const styles={accent:{scope:'global',name:'accent',attach:false,props:{text_color:'#22cc88'}}};
const base=createProject([screen],{id:'lab-project',name:'S3 project',styles});
for(const [name,edit] of Object.entries({base:p=>{},edited:p=>{p.screens.main.root.children[0].props.text='Saved edit';p.styles.accent.props.text_color='#eebb22';},extended:p=>{p.screens.extra=createBlankScreen('extra','Extra');},wrong:p=>p.manifest.id='another-project',badPreview:p=>p.screens.main.root.children[0].props.text='Uncommitted preview'})){
 const project=JSON.parse(JSON.stringify(base));edit(project);await writeFile(new URL(name+'.cbor',directory),encodeProject(project));await writeFile(new URL(name+'.json',directory),JSON.stringify(project,null,2)+'\n');
}
const extended=JSON.parse(JSON.stringify(base));extended.screens.extra=createBlankScreen('extra','Extra');
const catalog=compileCatalog(base,extended);await mkdir(new URL('catalog/',directory),{recursive:true});
for(const [name,bytes] of catalog.files)await writeFile(new URL('catalog/'+name,directory),bytes);

// Portable ProjectService/DataRegistry integration: ordinary widgets and symbolic app capabilities.
const bindingCapabilities=offlineCapabilities();bindingCapabilities.source='device';
bindingCapabilities.binding.sources=[{name:'app.measurement',writable:false,schema:{type:'object',fields:{value:{type:'integer',min:0,max:1000}}}}];
bindingCapabilities.binding.actions=[{name:'app.advance',schema:{type:'integer',min:1,max:100}}];
function boundScreen(id,prefix,step){
 const screen=createBlankScreen(id,id);
 const value=createNode('label','reading');value.props.text='--';
 value.bindings=[{method:'text',value:{source:'app.measurement',path:['value']},format:{prefix}}];
 const action=createNode('button','advance');action.props.text='Advance';
 action.events=[{event:'clicked',action:'app.advance',args:{literal:step}}];
 screen.root.children=[value,action];return screen;
}
const boundProject=createProject([boundScreen('overview','Base ',1),boundScreen('detail','Detail ',10)],{id:'bound-project',name:'Binding integration'});
for(const [name,prefix,step] of [['bindings-base','Base ',1],['bindings-edited','Saved ',2],['bindings-preview','Preview ',3]]){
 const project=structuredClone(boundProject);project.screens.overview=boundScreen('overview',prefix,step);
 const bytes=encodeProject(project,bindingCapabilities);
 assert.deepEqual(encodeProject(decodeProject(bytes,bindingCapabilities),bindingCapabilities),bytes);
 await writeFile(new URL(name+'.cbor',directory),bytes);
 await writeFile(new URL(name+'.json',directory),JSON.stringify(project,null,2)+'\n');
}
