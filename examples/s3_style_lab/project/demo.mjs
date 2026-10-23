import {createProject} from '../../../packages/project-codec/index.js';
import {extensions} from '../../native_widget/demo-screen.mjs';
import {offlineCapabilities} from '../../../packages/screen-codec/index.js';
export const capabilities={...offlineCapabilities(),extensions,availableWidgets:[...offlineCapabilities().availableWidgets,...extensions.map(w=>w.id)],resources:[{name:'montserrat_20',type:'const lv_font_t *'},{name:'montserrat_28',type:'const lv_font_t *'}]};
const colors={bg:'#101e28',panel:'#1b303d',edge:'#385563',text:'#e8f0f2',muted:'#9eb4c1',green:'#4de0ad',amber:'#ffc56b'};
const node=(id,type,props={},style={},children=[],styles=[])=>({id,type,props,style,children,styles});
const text=(id,value,x,y,extra={})=>node(id,'label',{text:value},{x,y,...extra});
const native=(id,type,x,y,width,height,props)=>node(id,type,{...extensions.find(w=>w.name===type).contract.defaults,...props},{x,y,width,height});
const screen=(id,name,children)=>({format:'lvgl-screen-draft-1',id,name,size:{width:800,height:480},theme:'none',styles:{},root:{...node('root','obj',{}, {bg_color:colors.bg,bg_opa:255,pad_all:0,text_color:colors.text},children),flags:{SCROLLABLE:false}}});
const shared={
 panel:{scope:'global',name:'panel',attach:false,props:{bg_color:colors.panel,bg_opa:255,border_color:colors.edge,border_width:1,radius:10,pad_all:0}},
 reading:{scope:'global',name:'reading',attach:false,props:{text_font:'montserrat_28',text_color:colors.green}},
 caption:{scope:'global',name:'caption',attach:false,props:{text_font:'montserrat_20',text_color:colors.muted}}
};
const tire=(id,title,pressure,temp,x,y)=>node(id,'obj',{}, {x,y,width:204,height:114},[
 text(id+'_name',title,12,10,{text_font:'montserrat_20'}),
 {...text(id+'_pressure',pressure+' bar',12,39),styles:[{ref:'global:reading'}]},
 text(id+'_temp',temp+' C  /  DEMO',12,82,{text_color:colors.muted})
], [{ref:'global:panel'}]);
const dashboard=screen('dashboard','Давление и GPS',[
 text('title','TPMS / GPS',20,14,{text_font:'montserrat_28'}),
 text('demo','DEMO DATA / sensors not connected',20,49,{text_color:colors.amber}),
 tire('front_left','FRONT LEFT','2.35',26,20,84),tire('front_right','FRONT RIGHT','2.32',27,238,84),
 tire('rear_left','REAR LEFT','2.28',25,20,212),tire('rear_right','REAR RIGHT','2.34',26,238,212),
 native('gps_speed','lab:speedometer',460,70,320,292,{title:'GPS / GROUND SPEED',range:[0,180],reading:[87,'km/h'],redline:130}),
 native('gps_status','lab:signal',20,348,422,110,{title:'GPS / DEMO FIX',state:2}),
 text('gps_meta','SAT 12  /  ALT 246 m',470,381,{text_font:'montserrat_20',text_color:colors.muted}),
 text('gps_notice','No receiver connected',470,418,{text_color:colors.amber})
]);
export const baseProject=createProject([dashboard],{id:'tpms-gps',name:'TPMS / GPS · стенд',styles:shared});
baseProject.manifest.description='Демонстрационный проект: четыре датчика давления и GPS. Значения примеров; привязки к оборудованию не подключены.';
const radar=screen('radar','Радар · обзор',[
 text('title','POLAR / SURROUND VIEW',20,14,{text_font:'montserrat_28'}),
 native('radar','lab:radar',16,58,416,412,{title:'DEMO / CONTACT TRACKER'}),
 text('heading','CONTACTS / DEMO',460,86,{text_font:'montserrat_20'}),
 text('legend','ALPHA       038 deg\nBRAVO       122 deg\nCHARLIE     230 deg\nDELTA       308 deg',460,139,{text_color:colors.green,text_line_space:12}),
 native('link','lab:signal',454,291,326,116,{title:'RADAR / DEMO',state:1}),
 text('note','Generated targets / no sensor',460,433,{text_color:colors.amber})
]);
const trip=screen('trip','GPS · маршрут',[
 text('title','GPS / TRIP COMPUTER',20,14,{text_font:'montserrat_28'}),
 native('speed','lab:speedometer',22,70,340,292,{title:'GPS / SPEED',range:[0,180],reading:[87,'km/h'],redline:130}),
 node('metrics','obj',{}, {x:390,y:82,width:388,height:276},[
 text('captions','DISTANCE\nMOVING TIME\nAVG SPEED\nALTITUDE\nSATELLITES',16,16,{text_font:'montserrat_20',text_line_space:21}),
 text('values','124.8 km\n01:43\n72 km/h\n246 m\n12',225,16,{text_font:'montserrat_20',text_color:colors.green,text_line_space:21})
 ],[{ref:'global:panel'}]),
 text('demo','DEMO DATA / GPS receiver not connected',22,408,{text_color:colors.amber,text_font:'montserrat_20'})
]);
export const storageProject=structuredClone(baseProject);
storageProject.screens.radar=radar;storageProject.screens.trip=trip;
storageProject.styles.radar_grid={scope:'global',name:'radar_grid',attach:false,props:{text_color:colors.green,border_color:colors.green,border_width:1}};
radar.root.children.find(n=>n.id==='legend').styles=[{ref:'global:radar_grid'}];
