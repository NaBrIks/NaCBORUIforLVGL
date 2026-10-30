import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url)),project=JSON.parse(await readFile(new URL('./demo.json',import.meta.url),'utf8'));
const exe=resolve(process.argv[2]??resolve(root,'local/windows-player/Release/nacborui_player.exe'));
const child=spawn(process.execPath,['examples/windows_player/run.mjs',fileURLToPath(new URL('./demo.json',import.meta.url)),'--hidden','--control','--no-settings','--exe',exe],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
const events=[],waiters=[];let stderr='',next=0;
child.stderr.on('data',value=>stderr+=value);
function take(test){const i=events.findIndex(test);if(i>=0)return Promise.resolve(events.splice(i,1)[0]);return new Promise((yes,no)=>{const w={test,yes,timer:setTimeout(()=>no(Error('Preview timeout '+stderr)),15000)};waiters.push(w);});}
createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line);}catch{return;}const i=waiters.findIndex(w=>w.test(e));if(i<0)events.push(e);else {const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.yes(e);}});
const command=async request=>{const id=++next;child.stdin.write(JSON.stringify({...request,id})+'\n');const r=await take(e=>e.event==='result'&&e.id===id);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.windowVisible,false);assert.equal(r.foreground,false);return r;};
const closed=new Promise(resolve=>child.once('close',resolve));
try {
  const loaded=await take(e=>e.event==='loaded');assert.deepEqual([loaded.width,loaded.height],[320,170]);
  await command({op:'write',source:'demo.running',value:false});await command({op:'write',source:'demo.text',value:'Text'});
  await command({op:'publish',source:'demo.speed',value:{kmh:42.5,unit:'km/h',sequence:7}});
  await mkdir(resolve(root,'local/lilygo-preview'),{recursive:true});
  for(const scheme of ['light','cream','emerald','dark'])for(const page of ['home','controls','schemes']) {
    await command({op:'scheme',scheme});await command({op:'click',node:'go_'+page});let r=await command({op:'inspect'});
    const instance=r.views[0].pageInstance,tree=[];assert.equal(r.views[0].selected,page);
    function walk(node,parent=null){tree.push({id:node.id,parent});node.children.forEach(child=>walk(child,node.id));}walk(project.screens[page].root);
    r=await command({op:'inspect',nodes:tree.map(({id})=>({id,instance}))});const bounds=new Map(r.nodes.map(node=>[node.id,node.bounds]));
    for(const node of tree)if(node.parent){const c=bounds.get(node.id),p=bounds.get(node.parent);assert.ok(c[0]>=p[0]&&c[1]>=p[1]&&c[2]<=p[2]&&c[3]<=p[3],page+'/'+node.id+' fits');}
    await command({op:'snapshot',path:resolve(root,'local/lilygo-preview',scheme+'-'+page+'.bmp')});
  }
  console.log('PASS: hidden LVGL 320x170, three pages x four palettes, actual component bounds and snapshots, no OS input/activation');
} finally {child.stdin.end();const timer=setTimeout(()=>child.kill(),3000);await closed;clearTimeout(timer);for(const w of waiters)clearTimeout(w.timer);}
