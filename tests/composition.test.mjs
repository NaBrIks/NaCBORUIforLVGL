import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {createSSRApp,createRenderer,h,ref} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {compositionContract,offlineCapabilities,screenContract,encodeScreen,decodeScreen,decodeScreenPacket,normalizeScreen,compositionAvailable} from '../packages/screen-codec/index.js';
import {createProject,encodeProject,decodeProject,projectCompositionGraph,validateProjectComposition} from '../packages/project-codec/index.js';
import {createBlankScreen} from '../frontend/src/screen-model.js';
import {createCompositionPreview} from '../frontend/src/modules/composition/preview-composition.js';
import {previewStyle} from '../frontend/src/preview-style.js';
import {useScreenWorkspace} from '../frontend/src/state/screen-workspace.js';
import {layoutCompositionGraph} from '../frontend/src/modules/composition/graph-layout.js';

const page=id=>createBlankScreen(id,id),view=(initial,pages=[initial])=>({pages:pages.map(screen=>({screen,retention:'release'})),initial,sizing:'fill'});
function project(){const shell=page('shell'),first=page('first'),second=page('second');shell.root.children=[{id:'content',type:'obj',style:{width:300,height:200},view:view('first',['first','second'])},{id:'nav',type:'button',props:{text:'Second'},events:[{event:'clicked',navigate:{view:'content',screen:'second'}}],styleRules:[{state:['CHECKED'],props:{bg_color:'#ff0000'}}]}];return createProject([shell,first,second]);}
const caps={...offlineCapabilities(),source:'device'};

test('composition metadata and navigation roundtrip independently of screen opcodes and application data',()=>{
 const p=project(),doc=p.screens.shell,original=structuredClone(doc),packet=decodeScreenPacket(encodeScreen(doc,'views',caps));
 assert.equal(packet.get('abi'),screenContract.sha256);assert.equal(packet.get('views_version'),compositionContract.version);assert.equal(packet.get('bindings_version'),1);
 assert.equal(packet.get('views')[0].get('node'),'content');assert.equal(packet.get('events')[0].get('navigate').get('view'),'content');
 const normalized=normalizeScreen(doc,caps);assert.deepEqual(normalizeScreen(normalized,caps),normalized);assert.deepEqual(normalized.root.children[0].view,doc.root.children[0].view);assert.deepEqual(doc,original);
 const noData={...caps,binding:undefined};assert.doesNotThrow(()=>encodeScreen(doc,'navigation-only',noData));
 const minimal=project();minimal.screens.shell.root.children[0].view={pages:[{screen:'first'}],initial:'first'};minimal.screens.shell.root.children[1].events=[];
 assert.deepEqual(normalizeScreen(minimal.screens.shell).root.children[0].view,view('first'));
 const plain=decodeScreenPacket(encodeScreen(page('plain'),'plain'));assert.equal(plain.has('views_version'),false);assert.equal(plain.has('views'),false);
 assert.deepEqual(decodeProject(encodeProject(p)).screens.shell.root.children[0].view,doc.root.children[0].view);
});
test('composition rejects malformed policies, missing local targets and missing version gates',()=>{
 const mutations=[d=>d.root.children[0].view=null,d=>d.root.children[0].view.initial='missing',d=>d.root.children[0].view.pages.push({screen:'first'}),d=>d.root.children[0].view.pages[0].retention='forever',d=>d.root.children[0].view.sizing='stretch',d=>d.root.children[1].events[0].navigate.view='missing',d=>d.root.children[1].events[0].navigate.screen='shell',d=>d.root.children[1].events[0].args={literal:null},d=>d.root.children[1].events.push({event:'long_pressed',navigate:{view:'content',screen:'first'}})];
 for(const mutate of mutations){const doc=project().screens.shell;mutate(doc);assert.throws(()=>encodeScreen(doc,'invalid'));}
 assert.equal(compositionAvailable({...caps,composition:undefined}),false);assert.throws(()=>encodeScreen(project().screens.shell,'old-device',{...caps,composition:undefined}),/composition unavailable/);
 const wire=decodeScreenPacket(encodeScreen(project().screens.shell,'wire'));wire.delete('views_version');assert.throws(()=>decodeScreen(encode(wire)),/version/);
 const duplicate=decodeScreenPacket(encodeScreen(project().screens.shell,'wire'));duplicate.get('views').push(duplicate.get('views')[0]);assert.throws(()=>decodeScreen(encode(duplicate)),/duplicate/);
 const empty=decodeScreenPacket(encodeScreen(page('empty'),'wire'));empty.set('views_version',1);assert.throws(()=>decodeScreen(encode(empty)),/Empty composition/);
 assert.doesNotThrow(()=>encodeScreen(project().screens.shell,'offline',offlineCapabilities()));
});
test('project graph has one source of edges, rejects initial recursion, and permits noninitial navigation cycles',()=>{
 const p=project(),before=structuredClone(p),graph=projectCompositionGraph(p);assert.equal(graph.edges.length,2);assert.deepEqual(graph.edges.map(e=>[e.from,e.to,e.initial]),[['shell','first',true],['shell','second',false]]);assert.deepEqual(p,before);
 p.screens.first.root.view=view('second',['second','shell']);assert.doesNotThrow(()=>encodeProject(p)); // shell is permitted later, never recursively initialized.
 p.screens.second.root.view=view('shell');assert.throws(()=>encodeProject(p),/Recursive initial/);delete p.screens.second.root.view;
 p.screens.first.root.view.pages.push({screen:'missing'});assert.throws(()=>encodeProject(p),/Unknown view screen/);
 const limited={...caps,composition:{...caps.composition,maxDepth:1}};assert.throws(()=>encodeProject(project(),limited),/depth\/instance/);
 const instances={...caps,composition:{...caps.composition,maxInstances:1}};assert.throws(()=>validateProjectComposition(project(),instances),/depth\/instance/);
});
test('graph layout places entry first and children on lower levels deterministically even with cycles',()=>{
 const graph={nodes:[{id:'child'},{id:'leaf'},{id:'shell',entry:true},{id:'unused'}],edges:[{from:'shell',to:'child'},{from:'child',to:'leaf'},{from:'leaf',to:'shell'},{from:'shell',to:'child'}]},original=structuredClone(graph),layout=layoutCompositionGraph(graph),byId=new Map(layout.nodes.map(node=>[node.id,node]));
 assert.deepEqual(layoutCompositionGraph(graph),layout);assert.deepEqual(graph,original);assert.equal(layout.nodes.length,4);assert.equal(byId.get('shell').level,0);assert.ok(byId.get('child').y>byId.get('shell').y);assert.ok(byId.get('leaf').y>byId.get('child').y);assert.equal(byId.get('unused').level,3);assert.ok(layout.nodes.every(node=>Number.isFinite(node.x)&&Number.isFinite(node.y)));
});
test('browser navigation scopes identical node IDs by instance and keeps failed target selected without writing authoring',()=>{
 const p=project();p.screens.shell.root.children.push({id:'other',type:'obj',view:view('first',['first','second'])});const original=structuredClone(p),model=createCompositionPreview(p.screens.shell,p.screens);
 assert.equal(model.instances().length,3);const a=model.root.views.content.child,b=model.root.views.other.child;assert.notEqual(a.id,b.id);assert.equal(a.screen.root.id,b.screen.root.id);
 const nav=p.screens.shell.root.children[1];assert.equal(model.checked(model.root,nav),false);assert.equal(model.navigate(model.root.id,{view:'content',screen:'second'}),true);assert.equal(model.checked(model.root,nav),true);assert.equal(model.root.views.other.child.id,b.id);
 assert.equal(model.navigate(model.root.id,{view:'content',screen:'missing'}),false);assert.equal(model.root.views.content.selected,'missing');assert.match(model.root.views.content.error,/Недопустимая/);assert.equal(model.root.views.content.child,null);
 const failedNav={events:[{navigate:{view:'content',screen:'missing'}}]};assert.equal(model.checked(model.root,failedNav),true);assert.deepEqual(p,original);
 const recursive=project();recursive.screens.shell.root.children[0].view.pages.push({screen:'shell',retention:'cache'});const cycle=createCompositionPreview(recursive.screens.shell,recursive.screens);assert.equal(cycle.navigate(cycle.root.id,{view:'content',screen:'shell'}),false);assert.equal(cycle.root.views.content.selected,'shell');assert.match(cycle.root.views.content.error,/Цикл/);
 assert.equal(previewStyle(nav,{states:['CHECKED']}).backgroundColor,'#ff0000ff');assert.notEqual(previewStyle(nav).backgroundColor,'#ff0000ff');
 assert.equal(previewStyle({type:'obj',flags:{SCROLLABLE:false}}).overflow,'hidden');assert.equal(previewStyle({type:'obj',flags:{SCROLLABLE:true}}).overflow,'auto');
 const constrained={type:'obj',style:{min_width:320,max_width:640,min_height:100,max_height:300}};assert.equal(previewStyle(constrained,{root:true,mounted:true}).minWidth,'320px');assert.equal(previewStyle(constrained,{root:true,mounted:true}).maxHeight,'300px');assert.equal(previewStyle(constrained,{root:true}).minWidth,undefined);
});
test('removing a referenced page preserves the project and reports the containers that use it',t=>{
 const p=project(),documents=ref(Object.values(p.screens)),before=structuredClone(p);let workspace;
 const renderer=createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}}),app=renderer.createApp({setup(){workspace=useScreenWorkspace(ref(null),{documents});return()=>h('div');}});app.mount({});t.after(()=>app.unmount());
 assert.equal(workspace.remove('first'),false);assert.equal(documents.value.length,3);assert.match(workspace.warning.value,/shell/);assert.deepEqual(p,before);
});
test('a newly selected page carries ancestor identities into its own initial views',()=>{
 const a=page('a'),b=page('b'),c=page('c');a.root.view=view('c',['c','b']);b.root.view=view('a');const p=createProject([a,b,c]);assert.doesNotThrow(()=>encodeProject(p));
 const preview=createCompositionPreview(a,p.screens);assert.equal(preview.navigate(preview.root.id,{view:'root',screen:'b'}),true);const selected=preview.root.views.root.child;assert.equal(selected.screen.id,'b');assert.equal(selected.views.root.selected,'a');assert.equal(selected.views.root.child,null);assert.match(selected.views.root.error,/Recursive/);assert.equal(preview.instances().filter(instance=>instance.screen.id==='a').length,1);assert.equal(preview.navigate(9999,{view:'root',screen:'b'}),false);
});
test('generic composition forms, project graph and nested viewport render without app-specific controls',async t=>{
 const root=fileURLToPath(new URL('../frontend',import.meta.url)),server=await createServer({root,configFile:root+'/vite.config.js',server:{middlewareMode:true,hmr:false},logLevel:'silent'});t.after(()=>server.close());
 const {default:View}=await server.ssrLoadModule('/src/modules/composition/ViewEditor.vue'),{default:Bindings}=await server.ssrLoadModule('/src/modules/bindings/BindingEditor.vue'),{default:Graph}=await server.ssrLoadModule('/src/modules/composition/CompositionGraph.vue'),{default:Virtual}=await server.ssrLoadModule('/src/components/VirtualScreen.vue');
 const p=project(),before=structuredClone(p),context={workspace:{project:ref(p)}};
 const render=(component,props)=>renderToString(createSSRApp({setup(){return()=>h(component,props);}}).provide('lvgl-project',context));
 const form=await render(View,{modelValue:p.screens.shell.root.children[0],screen:p.screens.shell,capabilities:caps});for(const label of ['Освобождать','Кэшировать','Удерживать','Начальная страница контейнера','Размер вложенной страницы'])assert.ok(form.includes(label));assert.ok(!form.includes('<textarea'));
 const {widgetCatalog}=await import('../packages/screen-codec/index.js');const events=await render(Bindings,{modelValue:p.screens.shell.root.children[1],screen:p.screens.shell,family:widgetCatalog(caps).find(f=>f.name==='button'),capabilities:caps});assert.match(events,/Событие 1 контейнер/);assert.match(events,/Событие 1 страница/);assert.ok(!events.includes('Unknown'));
 assert.match(await render(Graph,{project:p}),/<svg/);
 const preview=await render(Virtual,{screen:p.screens.shell,width:240,height:120,contained:true,mountSizing:'design'});assert.match(preview,/data-instance-id="1"/);assert.match(preview,/data-instance-id="2"/);assert.match(preview,/width:800px;height:480px/);assert.deepEqual(p,before);
});
