// Public LVGL 9.6 API inventory outside style setters. Offline, reproducible from the pinned component.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describeConstant,describeFunction,describeAccess} from './widget_reference_ru.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const lvgl=process.argv[2]??resolve(root,'examples/s3_style_lab/managed_components/lvgl__lvgl');
const version=await readFile(resolve(lvgl,'include/lvgl/lv_version.h'),'utf8');
if(!/LVGL_VERSION_MAJOR 9/.test(version)||!/LVGL_VERSION_MINOR 6/.test(version)||!/LVGL_VERSION_PATCH 0/.test(version))throw Error('Expected LVGL 9.6.0');
const scope=['core','widgets','layouts','display','indev','font','image','fs'];
const extra=['misc/lv_async.h'];
async function files(dir,ext){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())out.push(...await files(path,ext));else if(entry.name.endsWith(ext))out.push(path);}return out.sort();}
const headers=[...(await Promise.all(scope.map(dir=>files(resolve(lvgl,'include/lvgl',dir),'.h')))).flat(),...extra.map(p=>resolve(lvgl,'include/lvgl',p))];
const properties=[],functions=[],constants=[],sources=[];const fnNames=new Set();
const clean=text=>text.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,m=>' '.repeat(m.length));
const norm=text=>text.replace(/\s+/g,' ').trim();
const line=(text,index)=>text.slice(0,index).split('\n').length;
const link=(path,n)=>`https://github.com/lvgl/lvgl/blob/v9.6.0/${path}#L${n}`;
const operationMap=new Map();
for(const dir of ['core','widgets'])for(const path of await files(resolve(lvgl,'src',dir),'.c')){
 const text=await readFile(path,'utf8');
 sources.push({path:relative(lvgl,path).replaceAll('\\','/'),sha256:createHash('sha256').update(text).digest('hex')});
 for(const match of text.matchAll(/\{\s*\.id\s*=\s*(LV_PROPERTY_\w+)\s*,([\s\S]*?)\}/g)){
  const body=match[2],setter=body.match(/\.setter\s*=\s*(\w+)/)?.[1],getter=body.match(/\.getter\s*=\s*(\w+)/)?.[1];
  operationMap.set(match[1],{setter:setter==='NULL'?undefined:setter,getter:getter==='NULL'?undefined:getter});
 }
}
for(const path of headers){
 const text=await readFile(path,'utf8'),stripped=clean(text),file=relative(lvgl,path).replaceAll('\\','/');
 sources.push({path:file,sha256:createHash('sha256').update(text).digest('hex')});
 const family=path.split(/[\\/]/).at(-1).replace(/\.h$/,'').replace(/^lv_/,'');
 const category=/lv_(anim|timer|async)\.h$/.test(file)?'Анимации и планирование':file.includes('/widgets/')?'Виджеты':file.includes('/core/')?'Объект и поведение':file.includes('/layouts/')?'Компоновка · обёртки':file.includes('/display/')?'Дисплей и экраны':file.includes('/indev/')?'Устройства ввода':'Ресурсы';
 for(const match of stripped.matchAll(/LV_PROPERTY_ID(2?)\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(LV_PROPERTY_TYPE_\w+)\s*,\s*(?:(LV_PROPERTY_TYPE_\w+)\s*,\s*)?([^,)]+)\)/g)){
  const id=`LV_PROPERTY_${match[2]}_${match[3]}`;if(match[2]==='STYLE'||match[3]==='FLAG_START')continue;
  const ops=operationMap.get(id)??{};
  properties.push({id,family:match[2].toLowerCase(),type:match[4].replace('LV_PROPERTY_TYPE_','')+(match[5]?' + '+match[5].replace('LV_PROPERTY_TYPE_',''):''),index:match[6].trim(),...ops,access:ops.setter&&ops.getter?'R/W':ops.setter?'W':ops.getter?'R':'см. обработчик класса',path:file,line:line(stripped,match.index),category});
 }
 // Both ordinary declarations and static inline public functions; excludes typedef callbacks and variables.
 for(const match of stripped.matchAll(/^[ \t]*([^\n;{}=]*?\b(lv_\w+)\s*\(([^;{}]*?)\))\s*(?:LV_[A-Z_]+(?:\([^;{}]*?\))?\s*)*([;{])/gm)){
  const name=match[2],declaration=norm(match[1]);
  if(fnNames.has(name)||/^typedef\b/.test(declaration)||/\b(?:lv_style_|lv_obj_(?:set|get)_style_)/.test(name))continue;
  if(match[4]==='{'&&!/\binline\b/.test(declaration))continue;
  fnNames.add(name);
  const role=/_create(?:_|$)/.test(name)?'создание':/_(get|is|has|check)(?:_|$)/.test(name)?'чтение':/_(set|add|remove|clear|enable|disable)(?:_|$)/.test(name)?'настройка':/_(delete|clean)(?:_|$)/.test(name)?'жизненный цикл':'операция';
  const before=text.slice(Math.max(0,match.index-5000),match.index),comment=before.match(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*$/)?.[1]??'';
  const description=norm(comment.split(/@param|@return|@note|@code/)[0].replace(/^\s*\*\s?/gm,''));
  functions.push({name,signature:declaration+';',family,category,role,parameters:norm(match[3]),description,path:file,line:line(stripped,match.index)});
 }
 if(/lv_obj\.h$|lv_obj_style\.h$|lv_event\.h$/.test(file))for(const match of text.matchAll(/^\s*(LV_(?:OBJ_FLAG|STATE|PART|EVENT)_\w+)\s*(?:=\s*([^,\n]+))?,?\s*(?:\/\*<?!?\*?\s*([^\n]*?)\*\/)?/gm))constants.push({name:match[1],value:match[2]?.trim()??'автонумерация',description:match[3]??'',family,category,path:file,line:line(text,match.index)});
}
properties.sort((a,b)=>a.family.localeCompare(b.family)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
functions.sort((a,b)=>a.family.localeCompare(b.family)||a.role.localeCompare(b.role)||a.name.localeCompare(b.name));
constants.sort((a,b)=>a.family.localeCompare(b.family)||a.value.localeCompare(b.value)||a.name.localeCompare(b.name));
const families=[...new Set([...properties,...functions,...constants].map(v=>v.family))].sort();
for(const item of functions)item.description_ru=describeFunction(item,families);
for(const item of constants)item.description_ru=describeConstant(item);
const data={lvgl:'9.6.0',scope,extra,properties,functions,constants,sources};
await writeFile(resolve(root,'docs/widget_api_lvgl_9_6.data.json'),JSON.stringify(data,null,2)+'\n');
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const categories=[...new Set(functions.map(v=>v.category))].sort();
const rows=(list,kind)=>list.map(v=>`<tr data-kind="${kind}" data-family="${v.family}" data-type="${esc(v.type??v.role??v.value)}" data-category="${esc(v.category)}"><td class="family-cell">${esc(v.family)}</td><td class="type-cell">${esc(v.type??v.role??v.value)}</td><td class="name-cell"><a href="${link(v.path,v.line)}" target="_blank" rel="noreferrer"><code>${esc(v.id??v.signature??v.name)}</code></a></td><td>${esc(v.access?describeAccess(v.access):v.description_ru)}</td><td>${esc(v.setter??'')}</td><td>${esc(v.getter??'')}</td></tr>`).join('\n');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LVGL 9.6 · API помимо стилей</title><style>
:root{font:13px Segoe UI,Arial,sans-serif;color:#342f29;background:#f5f2eb;--line:#d8cebb;--surface:#fdfbf7;--head:#e6dfcf;--accent:#9b5e13}*{box-sizing:border-box}body{margin:0;height:100dvh;display:flex;flex-direction:column}header{padding:6px 10px;border-bottom:1px solid var(--line)}h1{font-size:17px;margin:0 0 5px}p{margin:3px 0}a{color:var(--accent)}details{font-size:12px}summary{cursor:pointer}.toolbar{display:flex;align-items:center;gap:6px;padding:5px 10px;flex-wrap:wrap}button,input,select{font:inherit;padding:2px 5px;border:1px solid var(--line);background:var(--surface);color:inherit}button{cursor:pointer}button[aria-pressed=true]{background:var(--head);font-weight:600}input{width:220px}.count{margin-left:auto;font-variant-numeric:tabular-nums}main{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}table{table-layout:fixed;border-collapse:separate;border-spacing:0;width:100%;min-width:1100px;background:var(--surface);font-size:12px}td,th{padding:3px 6px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{position:sticky;top:0;background:var(--head);z-index:1}.family-cell,th:first-child{width:100px;overflow-wrap:anywhere}.family-cell{background:var(--head)}.type-cell,th:nth-child(2){width:125px;overflow-wrap:anywhere}#name-head{width:340px}.name-cell code{display:block}table[data-kind=function] #name-head{width:52%}table[data-kind=property] #name-head{width:auto}table[data-kind=property] th:nth-child(4){width:140px}table[data-kind=property] :is(th,td):nth-child(n+5){width:230px;overflow-wrap:anywhere}table:not([data-kind=property]) :is(th,td):nth-child(n+5){display:none}code{font:12px Consolas,monospace;overflow-wrap:anywhere}tr:hover td{background:#e18f2f24}[hidden]{display:none!important}footer{padding:4px 10px;border-top:1px solid var(--line);font-size:11px}.sets{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:3px 12px;padding:5px 0}.sets p{border-bottom:1px solid var(--line);padding:3px}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent)}@media(prefers-color-scheme:dark){:root{color:#e1e1dc;background:#202526;--line:#4a5355;--surface:#272e30;--head:#364144;--accent:#f1b25f}}
</style></head><body><header><h1>LVGL 9.6.0 · свойства и функции помимо стилей</h1><p>Не только «CSS»: данные виджетов, поведение объекта, события, дерево, экраны, ресурсы и ввод. <a href="style_matrix_lvgl_9_6.html">Отдельная матрица стилей →</a></p><details><summary>Какие ещё наборы есть и как читать таблицы</summary><div class="sets"><p><b>Стили.</b> Оформление и геометрия, part/state, Flex/Grid. Уже имеют отдельный shared ABI.</p><p><b>Widget properties.</b> Текст, значение, диапазон, options, точки и другие данные класса. Generic Property API покрывает лишь часть C API; требует LV_USE_OBJ_PROPERTY.</p><p><b>Флаги и состояния.</b> Видимость, ввод, скролл, checked/disabled. Состояния также выбирают стили, но не являются их значениями.</p><p><b>Дерево и жизненный цикл.</b> Создание, родители, порядок, удаление, переходы экранов. Это команды, не сохраняемые поля оформления.</p><p><b>События и биндинги.</b> Реакция на clicked/value_changed, подписки и Subjects. В JSON — символы разрешённых действий, без адресов функций.</p><p><b>Ресурсы и службы.</b> Шрифты, изображения, анимации, таймеры, дисплеи и устройства ввода. Аппаратные драйверы в этот каталог не входят.</p></div><p>Область сканирования: публичные include/lvgl/{${scope.join(', ')}} и ${extra.join(', ')}. Стили lv_style_* / lv_obj_*_style_* исключены; геометрические и layout-обёртки оставлены и помечены отдельно по семейству. Это каталог исходников, а не обещание поддержки всех функций в прошивке. Включение функций зависит от lv_conf.h. Числа строк и ссылки закреплены на теге v9.6.0; чтение R/W получено из .setter/.getter, отсутствие записи требует проверки обработчика класса.</p><p>Generic API использует собственные внутренние числовые Property ID LVGL. Это не наш сетевой ABI, отправлять их как устойчивые ID между версиями нельзя. Запись LV_PROPERTY_ID2 несёт два типизированных значения.</p></details></header>
<div class="toolbar"><button data-tab="property" aria-pressed="true">Свойства (${properties.length})</button><button data-tab="function" aria-pressed="false">Функции (${functions.length})</button><button data-tab="constant" aria-pressed="false">Флаги / states / events (${constants.length})</button><input id="query" type="search" aria-label="Поиск" placeholder="Имя, тип, функция…"><select id="family" aria-label="Семейство"><option value="">Все семейства</option>${families.map(v=>`<option>${esc(v)}</option>`).join('')}</select><select id="category" aria-label="Набор"><option value="">Все наборы</option>${categories.map(v=>`<option>${esc(v)}</option>`).join('')}</select><span id="count" class="count"></span></div>
<main><table><thead><tr><th>Семейство</th><th>Тип / роль</th><th id="name-head">Свойство / точная C-сигнатура</th><th>Доступ / пояснение</th><th>Setter</th><th>Getter</th></tr></thead><tbody>${rows(properties,'property')}${rows(functions,'function')}${rows(constants,'constant')}</tbody></table></main><footer>Сгенерировано tools/build_widget_reference.mjs из локального LVGL 9.6.0. SHA256 источников: widget_api_lvgl_9_6.data.json. Таблица не является контрактом экранов.</footer><script>
let tab='property';const rows=[...document.querySelectorAll('tbody tr')],q=document.querySelector('#query'),f=document.querySelector('#family'),c=document.querySelector('#category');
function mergeCells(visible,column,key){let first=null,previous;for(const row of visible){const value=key(row),cell=row.cells[column];if(first&&value===previous){first.rowSpan++;cell.hidden=true;}else{first=cell;previous=value;}}}
function filter(){const visible=[];document.querySelector('table').dataset.kind=tab;for(const row of rows){for(const cell of [row.cells[0],row.cells[1]]){cell.hidden=false;cell.rowSpan=1;}row.hidden=row.dataset.kind!==tab||(f.value&&row.dataset.family!==f.value)||(c.value&&row.dataset.category!==c.value)||!row.textContent.toLowerCase().includes(q.value.toLowerCase());if(!row.hidden)visible.push(row);}mergeCells(visible,0,row=>row.dataset.family);mergeCells(visible,1,row=>row.dataset.family+'|'+row.dataset.type);document.querySelector('#count').textContent=visible.length+' строк';}
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filter();});q.value=new URLSearchParams(location.search).get('q')??'';q.oninput=f.onchange=c.onchange=filter;filter();
</script></body></html>`;
await writeFile(resolve(root,'docs/widget_api_lvgl_9_6.html'),html);
console.log(JSON.stringify({headers:headers.length,properties:properties.length,functions:functions.length,constants:constants.length}));



