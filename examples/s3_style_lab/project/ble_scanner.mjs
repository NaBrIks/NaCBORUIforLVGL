import {bindingContract,screenContract} from '../../../packages/screen-codec/index.js';
export const scannerId='ble-scanner';
const integer=(min=0,max=9007199254740991)=>({type:'integer',min,max});
const text=maxBytes=>({type:'text',maxBytes});
export const scannerBindingCatalog={version:1,sources:[
 {name:'ble.scan.enabled',title:'BLE scanning',writable:true,schema:{type:'bool'}},
 {name:'ble.scan.status',title:'BLE scanner status',writable:false,schema:{type:'object',fields:{
  state:text(16),packets:integer(0,4294967295),dropped:integer(0,4294967295),count:integer(0,16),error:text(96)
 }}},
 {name:'ble.scan.devices',title:'Nearby BLE devices',writable:false,schema:{type:'array',minItems:0,maxItems:16,items:{type:'object',fields:{
  address:text(17),addressType:integer(0,255),name:text(32),rssi:integer(-128,127),manufacturer:integer(-1,65535),packets:integer(0,4294967295),lastSeenMs:integer()
 }}}}
],actions:['start','stop','clear'].map(name=>({name:'ble.scan.'+name,title:name+' BLE scan',schema:{type:'null'}})),events:bindingContract.events,limits:bindingContract.limits};
const colors={background:'#101e28',text:'#e8f0f2',muted:'#9eb4c1',accent:'#4de0ad',line:'#385563'};
const label=(id,value,x,y,width,extra={})=>({id,type:'label',props:{text:value,long_mode:1,max_lines:1},style:{x,y,width,height:26,...extra},children:[]});
const binding=(node,source,path,format={unknown:'--'})=>({...node,bindings:[{method:'text',value:{source,path},format}]});
export function createScannerScreen(){
 const children=[
  label('ble-title','BLUETOOTH / NEARBY DEVICES',16,12,660,{text_font:'montserrat_28'}),
  binding(label('ble-state','--',16,62,300),'ble.scan.status',['state'],{prefix:'STATE  ',unknown:'STATE  --'}),
  label('ble-scan-caption','SCAN',350,62,70),
  {id:'ble-scan',type:'switch',props:{checked:false},style:{x:426,y:59,width:62,height:30},children:[],
   styleRules:[
    {part:'MAIN',props:{bg_color:colors.line,bg_opa:255,border_color:colors.muted,border_width:1,border_opa:255,radius:15,pad_all:2}},
    {part:'INDICATOR',props:{bg_color:colors.line,bg_opa:255,radius:15}},
    {part:'INDICATOR',state:['CHECKED'],props:{bg_color:colors.accent}},
    {part:'KNOB',props:{bg_color:colors.text,bg_opa:255,border_color:colors.background,border_width:1,border_opa:255,radius:15,pad_all:-4}},
    {part:'KNOB',state:['CHECKED'],props:{bg_color:colors.background}}
   ],
   bindings:[{scope:'common',method:'state',value:[{literal:screenContract.states.CHECKED},{source:'ble.scan.enabled'}]}],
   events:[{event:'value_changed',write:{source:'ble.scan.enabled',path:[]},value:{event:'value'}}]},
  {id:'ble-clear',type:'button',props:{text:'Clear'},style:{x:520,y:52,width:112,height:42,radius:3,bg_color:colors.line,bg_opa:255},children:[],
   events:[{event:'clicked',action:'ble.scan.clear',args:{literal:null}}]},
  label('ble-name-heading','NAME',16,112,264,{text_color:colors.muted}),
  label('ble-address-heading','ADDRESS',292,112,238,{text_color:colors.muted}),
  label('ble-rssi-heading','dBm',542,112,80,{text_align:'LV_TEXT_ALIGN_RIGHT',text_color:colors.muted}),
  label('ble-packets-heading','PACKETS',652,112,124,{text_align:'LV_TEXT_ALIGN_RIGHT',text_color:colors.muted})
 ];
 for(let i=0;i<8;i++){
  const y=146+i*33;
  const name=label('ble-name-'+i,'--',16,y,264),nameValue={source:'ble.scan.devices',path:[i,'name']};
  name.bindings=[{method:'text',value:{op:'select',args:[{op:'eq',args:[nameValue,{literal:''}]},{literal:'--'},nameValue]},format:{unknown:'--'}}];
  children.push(
   name,
   binding(label('ble-address-'+i,'--',292,y,238),'ble.scan.devices',[i,'address']),
   binding(label('ble-rssi-'+i,'--',542,y,80,{text_align:'LV_TEXT_ALIGN_RIGHT',text_color:colors.accent}),'ble.scan.devices',[i,'rssi']),
   binding(label('ble-packets-'+i,'--',652,y,124,{text_align:'LV_TEXT_ALIGN_RIGHT'}),'ble.scan.devices',[i,'packets'])
  );
 }
 children.push(
  binding(label('ble-count','--',16,426,228,{text_color:colors.muted}),'ble.scan.status',['count'],{prefix:'DEVICES  ',suffix:' / 16',unknown:'DEVICES  -- / 16'}),
  binding(label('ble-total','--',266,426,248,{text_color:colors.muted}),'ble.scan.status',['packets'],{prefix:'RECEIVED  ',unknown:'RECEIVED  --'}),
  binding(label('ble-dropped','--',548,426,228,{text_color:colors.muted}),'ble.scan.status',['dropped'],{prefix:'DROPPED  ',unknown:'DROPPED  --'})
 );
 return {format:'lvgl-screen-draft-1',id:scannerId,name:'Bluetooth · сканер',size:{width:800,height:480},theme:'none',styles:{},root:{
  id:'ble-root',type:'obj',props:{},style:{bg_color:colors.background,bg_opa:255,pad_all:0,text_color:colors.text,text_font:'montserrat_20'},flags:{SCROLLABLE:false},children
 }};
}
// Existing scanner edits are owner data too. Never replace that named screen
// when rebuilding an explicitly supplied complete project.
export function appendScanner(project){
 const result=structuredClone(project);result.screens[scannerId]??=createScannerScreen();return result;
}
