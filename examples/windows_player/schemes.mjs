import {readFile} from 'node:fs/promises';
import {createProject,encodeProject} from '../../packages/project-codec/index.js';

const colors=['canvas','surface','surfaceAlt','border','text','muted','bar','barText','primary','hover'];
function luminance(hex) {
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
}
export const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
export function roleStyles(p) {
  // The standard has no on-primary token. Choose readable ink for both button states.
  const ink=Math.min(contrast(p.primary,'#ffffff'),contrast(p.hover,'#ffffff'))>=4.5?'#ffffff':'#111111';
  return {
    canvas:{bg_color:p.canvas,bg_opa:255,text_color:p.text,border_color:p.border},
    panel:{bg_color:p.surface,bg_opa:255,text_color:p.text,border_color:p.border},
    status:{bg_color:p.bar,bg_opa:255,text_color:p.barText},
    text:{text_color:p.text},muted:{text_color:p.muted},
    button:{bg_color:p.primary,bg_opa:255,text_color:ink,border_width:0,shadow_width:0},
    button_pressed:{bg_color:p.hover,text_color:ink},
    button_focus:{bg_color:p.hover,text_color:ink,outline_color:p.primary,outline_width:1,outline_pad:1},
    button_disabled:{bg_color:p.surfaceAlt,bg_opa:255,text_color:p.muted},
    indicator:{bg_color:p.primary},track:{bg_color:p.surfaceAlt,bg_opa:255},
    knob:{bg_color:p.text,border_color:p.primary,shadow_width:0},
    arc_track:{arc_color:p.border},arc_value:{arc_color:p.primary}
  };
}
export async function compileSchemes(path=new URL('./schemes.json',import.meta.url)) {
  const catalog=JSON.parse(await readFile(path,'utf8'));
  if(catalog.format!=='nacborui-windows-schemes-1')throw Error('Scheme catalog format');
  const entries=Object.entries(catalog.schemes??{});
  if(entries.length<1||entries.length>8||!Object.hasOwn(catalog.schemes,catalog.default))throw Error('Scheme catalog entries/default');
  const styles={},screens=[];
  for(const [id,p] of entries) {
    if(!/^[a-z][a-z0-9_]{0,11}$/.test(id)||typeof p.name!=='string'||!p.name.length||p.name.length>64)throw Error('Scheme identity');
    for(const key of colors)if(!/^#[0-9a-f]{6}$/i.test(p[key]??''))throw Error('Scheme color '+id+'.'+key);
    for(const [role,props] of Object.entries(roleStyles(p)))styles[id+'.'+role]={scope:'global',name:id+'.'+role,attach:false,props};
    // Reuse the existing project envelope. These tiny screens carry catalog titles;
    // they are never instantiated by the player.
    screens.push({format:'lvgl-screen-draft-1',id,name:p.name,size:{width:64,height:64},styles:{},
      root:{id:'root',type:'obj',props:{},style:{},children:[]}});
  }
  const project=createProject(screens,{id:'windows-schemes',name:'Windows appearance resources',styles});
  if(Object.keys(styles).length>128)throw Error('Scheme style limit');
  return {default:catalog.default,choices:entries.map(([id,p])=>({id,name:p.name})),bytes:encodeProject(project)};
}
