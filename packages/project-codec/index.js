import {encode} from 'cborg';
import {encodeScreen,decodeScreen,screenContract} from '@lvgl-cbor/screen-codec';
import {encodeStyle,decodeStyle,decodePacket,contract} from '@lvgl-cbor/style-codec';
import {object,text} from '@lvgl-cbor/style-codec/values';
import {validateProjectComposition} from './composition.js';
export {projectCompositionGraph,validateProjectComposition} from './composition.js';

export const projectFormat='lvgl-project-1',maxProjectBytes=2*1024*1024,maxProjectItems=128;
const copy=value=>JSON.parse(JSON.stringify(value));
const entries=value=>{object(value,Object.keys(value??{}),'Project collection');if(Object.keys(value).length>maxProjectItems)throw Error('Project item limit');return Object.entries(value);};
const plain=value=>value instanceof Map?Object.fromEntries([...value].map(([key,item])=>[key,plain(item)])):Array.isArray(value)?value.map(plain):value;
const globalName=ref=>/^(global|global-dynamic):/.test(ref??'')?ref.slice(ref.indexOf(':')+1):null;

// Dependency order is compiled on the PC, never inferred by the MCU executor.
function orderedStyles(styles){
 const ordered=[],visiting=new Set(),done=new Set();
 function visit(name){
  if(done.has(name))return;if(visiting.has(name))throw Error('Project style dependency cycle: '+name);
  const style=styles[name];if(!style)throw Error('Unknown project style '+name);visiting.add(name);
  for(const ref of [style.copy,...(style.merge??[])]){const dep=globalName(ref);if(dep&&dep!=='base')visit(dep);}
  visiting.delete(name);done.add(name);ordered.push([name,style]);
 }
 for(const name of Object.keys(styles))visit(name);return ordered;
}
function checkReferences(screen,styles){
 function walk(node){for(const use of node.styles??[]){const name=globalName(use.ref);if(name&&name!=='base'&&!Object.hasOwn(styles,name))throw Error('Unknown project style '+name);}for(const child of node.children??[])walk(child);}
 walk(screen.root);
}
export function compileProject(project,capabilities){
 object(project,['format','manifest','screens','styles'],'Project');if(project.format!==projectFormat)throw Error('Project format');
 const manifest=project.manifest;object(manifest,['id','name','entry','description','requirements'],'Project manifest');
 text(manifest.id,63,'Project ID');text(manifest.name,128,'Project name');text(manifest.entry,63,'Entry screen');
 if(manifest.description!==undefined)text(manifest.description,2048,'Project description',true);
 const requirements=manifest.requirements??{screenABI:screenContract.sha256,styleABI:contract.sha256};
 object(requirements,['screenABI','styleABI'],'Project requirements');
 if(requirements.screenABI!==screenContract.sha256||requirements.styleABI!==contract.sha256)throw Error('Project ABI mismatch');
 const screenEntries=entries(project.screens),styleEntries=entries(project.styles);
 if(!screenEntries.length||!Object.hasOwn(project.screens,manifest.entry))throw Error('Project entry screen missing');
 validateProjectComposition(project,capabilities);
 for(const [name,style] of styleEntries){text(name,31,'Project style name');if(style.name!==name||style.scope!=='global')throw Error('Project styles require matching names and global scope');}
 const styles=new Map(orderedStyles(project.styles).map(([name,style])=>[name,encodeStyle({...style,attach:false},'project-style',capabilities)]));
 const screens=new Map(screenEntries.map(([name,screen])=>{text(name,63,'Screen ID');if(screen.id!==name)throw Error('Project screen identity mismatch');checkReferences(screen,project.styles);return [name,encodeScreen(screen,'project-screen',capabilities)];}));
 return {manifest:encode({...manifest,requirements},{mapSorter:null}),screens,styles};
}
export function encodeProject(project,capabilities){
 const bytes=encode({format:projectFormat,...compileProject(project,capabilities)},{mapSorter:null});
 if(bytes.length>Math.min(maxProjectBytes,capabilities?.project?.maxBytes??maxProjectBytes))throw Error('Project too large');return bytes;
}
// Authoring JSON names its operations. It can be recompiled after append-only screen
// additions; old numeric CBOR is still decoded only against its exact fingerprint.
// Return a copy only after the complete project validates. This does not assert live compatibility.
export function recompileProjectAuthoring(project,capabilities){
 const candidate=copy(project),requirements=candidate?.manifest?.requirements;
 const migrated=!!requirements&&requirements.screenABI!==screenContract.sha256;
 if(migrated){
  if(typeof requirements.screenABI!=='string'||!(/^[0-9a-f]{64}$/i).test(requirements.screenABI)||requirements.styleABI!==contract.sha256)throw Error('Project ABI mismatch');
  candidate.manifest.requirements={...requirements,screenABI:screenContract.sha256};
 }
 encodeProject(candidate,capabilities);return {project:candidate,migrated};
}
export function decodeProject(bytes,capabilities){
 const root=decodePacket(bytes,maxProjectBytes);if(!(root instanceof Map)||root.size!==4||root.get('format')!==projectFormat)throw Error('Project CBOR envelope');
 const metadata=root.get('manifest');if(!(metadata instanceof Uint8Array))throw Error('Project manifest bytes');
 const metadataMap=decodePacket(metadata,8192);if(!(metadataMap instanceof Map))throw Error('Project manifest map');
 const project={format:projectFormat,manifest:plain(metadataMap),screens:{},styles:{}};
 for(const kind of ['screens','styles']){
  const map=root.get(kind);if(!(map instanceof Map)||map.size>maxProjectItems)throw Error('Project collection');
  for(const [name,packet] of map){if(typeof name!=='string'||!(packet instanceof Uint8Array))throw Error('Project entry');Object.defineProperty(project[kind],name,{value:kind==='screens'?decodeScreen(packet,capabilities):decodeStyle(packet),enumerable:true,writable:true,configurable:true});}
 }
 encodeProject(project,capabilities);return project;
}
export function serializeProject(project,format,{capabilities}={}){
 const wire=encodeProject(project,capabilities);if(format==='cbor')return wire;if(format!=='json')throw Error('Project file format');
 const bytes=new TextEncoder().encode(JSON.stringify(project,null,2)+'\n');if(bytes.length>maxProjectBytes)throw Error('Project too large');return bytes;
}
export function parseProject(input,{format,capabilities,onRecompile}={}){
 const bytes=typeof input==='string'?new TextEncoder().encode(input):input;
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>maxProjectBytes)throw Error('Project file size');
 format??=bytes.find(b=>![9,10,13,32].includes(b))===123?'json':'cbor';
 if(format==='cbor')return decodeProject(bytes,capabilities);if(format!=='json')throw Error('Project file format');
 const original=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),result=recompileProjectAuthoring(original,capabilities);if(result.migrated)onRecompile?.();return result.project;
}
export function createProject(screens,{id='project',name='Новый проект',styles={}}={}){
 const collection=Object.fromEntries(screens.map(screen=>[screen.id,copy(screen)]));
 return {format:projectFormat,manifest:{id,name,entry:screens[0]?.id??'',requirements:{screenABI:screenContract.sha256,styleABI:contract.sha256}},screens:collection,styles:copy(styles)};
}
export {DataClient} from './data-client.js';
