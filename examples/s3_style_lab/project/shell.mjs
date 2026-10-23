import {bindingContract} from '../../../packages/screen-codec/index.js';
export const shellId='shell';
const integer=()=>({type:'integer',min:0,max:9007199254740991});
const text=maxBytes=>({type:'text',maxBytes});
export const systemBindingCatalog={version:1,sources:[
 {name:'system.network',title:'Network status',writable:false,schema:{type:'object',fields:{connected:{type:'bool'},ip:text(15)}}},
 {name:'system.clock',title:'System clock',writable:false,schema:{type:'object',fields:{
  syncState:text(16),timezone:text(63),localTime:text(8),unixSeconds:integer(),lastSyncAgeSeconds:integer(),error:text(96)
 }}}
],actions:[],events:bindingContract.events,limits:bindingContract.limits};
export function withSystemBindings(catalog=systemBindingCatalog){
 const sources=new Map((catalog.sources??[]).map(source=>[source.name,source]));
 for(const source of systemBindingCatalog.sources)sources.set(source.name,source);
 return {...systemBindingCatalog,...catalog,sources:[...sources.values()]};
}
// Application choices for this optional demo. The factory itself accepts any
// registered project page; the editor/runtime have no page-name branches.
export const demoShellOptions={initial:'dashboard',labels:{dashboard:'TPMS / GPS',radar:'Radar',trip:'Trip',
 'workbench-main':'Workshop'},retention:{dashboard:'retain',radar:'cache'}};
const colors={background:'#101e28',panel:'#1b303d',line:'#385563',text:'#e8f0f2',muted:'#9eb4c1',accent:'#4de0ad'};
const label=(id,x,width,source,path,format)=>({id,type:'label',props:{text:'--',long_mode:1,max_lines:1},
 style:{x,y:2,width,height:24},children:[],bindings:[{method:'text',value:{source,path},format}]});
export function createShell(project,{id=shellId,initial=project.manifest.entry,labels={},retention={},sizing='design'}={}){
 const pages=Object.entries(project.screens).filter(([name])=>name!==id);
 if(!pages.length||!pages.some(([name])=>name===initial))throw Error('Shell initial page must exist');
 if(!['fill','design'].includes(sizing))throw Error('Shell sizing');
 const declarations=pages.map(([screen])=>{
  const policy=retention[screen]??'release';
  if(!['release','cache','retain'].includes(policy))throw Error('Shell retention '+screen);
  return {screen,retention:policy};
 });
 const width=800,height=480,statusHeight=28,footerHeight=44;
 const clock=label('system-time',12,128,'system.clock',['localTime'],{unknown:'--:--:--'});
 const state=label('system-sync',150,280,'system.clock',['syncState'],{prefix:'NTP  ',unknown:'NTP  --'});
 state.style.text_color=colors.muted;
 const ip=label('system-ip',440,348,'system.network',['ip'],{prefix:'IP  ',unknown:'IP  --'});
 ip.style.text_align='LV_TEXT_ALIGN_RIGHT';
 const buttons=pages.map(([screen,document],index)=>{
  const x=Math.floor(index*width/pages.length),right=Math.floor((index+1)*width/pages.length);
  return {id:'nav-'+index,type:'button',props:{text:labels[screen]??document.name??screen},
   style:{x,y:0,width:right-x,height:footerHeight,bg_color:colors.panel,bg_opa:255,border_color:colors.line,
    border_width:1,border_opa:255,radius:0,pad_all:3,text_color:colors.text,text_align:'LV_TEXT_ALIGN_CENTER'},
   styleRules:[{part:'MAIN',state:['CHECKED'],props:{bg_color:colors.line,border_color:colors.accent,text_color:colors.accent}}],
   events:[{event:'clicked',navigate:{view:'content',screen}}],children:[]};
 });
 return {format:'lvgl-screen-draft-1',id,name:'Оболочка · время, сеть и страницы',size:{width,height},theme:'none',styles:{},root:{
  id:'shell-root',type:'obj',props:{},flags:{SCROLLABLE:false},style:{width,height,pad_all:0,bg_color:colors.background,
   bg_opa:255,text_color:colors.text,text_font:'montserrat_20'},children:[
   {id:'statusbar',type:'obj',props:{},flags:{SCROLLABLE:false},style:{x:0,y:0,width,height:statusHeight,
    pad_all:0,radius:0,border_width:0,bg_color:colors.panel,bg_opa:255},children:[clock,state,ip]},
   {id:'content',type:'obj',props:{},flags:{SCROLLABLE:true},style:{x:0,y:statusHeight,width,
    height:height-statusHeight-footerHeight,pad_all:0,radius:0,border_width:0,bg_color:colors.background,bg_opa:255},
    view:{pages:declarations,initial,sizing},children:[]},
   {id:'navigation',type:'obj',props:{},flags:{SCROLLABLE:false},style:{x:0,y:height-footerHeight,width,
    height:footerHeight,pad_all:0,radius:0,border_width:0,bg_color:colors.panel,bg_opa:255},children:buttons}
  ]}};
}
export function appendShell(project,options={}){
 const result=structuredClone(project),id=options.id??shellId;
 // An existing shell is authoring data. Adding a wrapper never replaces edits.
 if(result.screens[id])return result;
 result.screens[id]=createShell(result,options);result.manifest.entry=id;return result;
}
