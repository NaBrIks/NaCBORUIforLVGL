// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Documentation generator only. Run with Node.js; downloads pinned LVGL headers/sources.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const version = 'v9.6.0';
const sourcePaths = [
  'include/lvgl/core/lv_style.h', 'src/misc/lv_style.c', 'include/lvgl/core/lv_style_gen.h',
  'include/lvgl/core/lv_obj_style.h', 'include/lvgl/core/lv_obj_style_gen.h', 'src/core/lv_obj_style.c',
  'include/lvgl/core/lv_obj_pos.h', 'src/core/lv_obj_pos.c',
  'include/lvgl/layouts/lv_flex.h', 'src/layouts/flex/lv_flex.c',
  'include/lvgl/layouts/lv_grid.h', 'src/layouts/grid/lv_grid.c',
];
const sources = new Map(await Promise.all(sourcePaths.map(async path => {
  const response = await fetch(`https://raw.githubusercontent.com/lvgl/lvgl/${version}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return [path, await response.text()];
})));
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const normalize = text => text.replace(/\s+/g, ' ').trim();
const definitions = new Map();
const declarations = new Map();
for (const [path, source] of sources) {
  const cleaned = stripComments(source);
  const regex = /^(?:static\s+inline\s+)?(void|bool)\s+(lv_(?:style|obj)_\w+)\s*\(([^;{}]*?)\)\s*([;{])/gm;
  for (const match of cleaned.matchAll(regex)) {
    const [, result, name, parameters, ending] = match;
    const signature = `${result} ${name}(${normalize(parameters)});`;
    const declarationMatch = new RegExp('^(?:static\\s+inline\\s+)?(?:void|bool)\\s+' + name + '\\s*\\(', 'm').exec(source);
    const line = source.slice(0, declarationMatch.index).split('\n').length;
    if (path.endsWith('.h')) declarations.set(name, { name, signature, path, line });
    if (ending === '{') {
      const start = match.index + match[0].length;
      let depth = 1, end = start;
      while (depth && end < cleaned.length) {
        if (cleaned[end] === '{') depth++;
        if (cleaned[end] === '}') depth--;
        end++;
      }
      definitions.set(name, cleaned.slice(start, end - 1));
    }
  }
}

const groupDefinitions = [
  ['size', 'Размеры', /^(?:min_|max_)?(?:width|height)$|^length$/],
  ['position', 'Положение', /^(?:x|y|align|radial_offset)$/],
  ['transform', 'Трансформация', /^(?:transform_|translate_)/],
  ['padding', 'Внутренние отступы', /^pad_/],
  ['margin', 'Внешние отступы', /^margin_/],
  ['background', 'Фон', /^bg_(?!image)/],
  ['background-image', 'Фоновое изображение', /^bg_image_/],
  ['border', 'Граница', /^border_/],
  ['outline', 'Внешний контур', /^outline_/],
  ['shadow', 'Тень', /^(?:drop_)?shadow_/],
  ['image', 'Изображение', /^image_/],
  ['line', 'Линия', /^line_/],
  ['arc', 'Дуга', /^arc_/],
  ['text', 'Текст', /^text_/],
  ['effects', 'Общие эффекты', /^(?:radius|blur_.*|clip_corner|opa|opa_layered|color_filter_.*|recolor|recolor_opa|blend_mode|bitmap_mask_src)$/],
  ['animation', 'Анимация', /^(?:anim|anim_duration|transition)$/],
  ['layout', 'Компоновка и ввод', /^(?:layout|base_dir|rotary_sensitivity)$/],
  ['flex', 'Flex', /^flex_/],
  ['grid', 'Grid', /^grid_/],
];
const typedNames = [...declarations.keys()].filter(name => name.startsWith('lv_style_set_') && name !== 'lv_style_set_prop' && !definitions.has(name));
const typedProperties = typedNames.map(name => name.slice('lv_style_set_'.length));
const enumProperties = [...sources.get('include/lvgl/core/lv_style.h').matchAll(/^\s*LV_STYLE_([A-Z][A-Z_0-9]*)\s*=\s*\d+\s*,/gm)]
  .map(m => m[1].toLowerCase()).filter(name => !['prop_inv', 'last_built_in_prop'].includes(name));
const propertyNames = [...new Set([...enumProperties, ...typedProperties])];
const properties = propertyNames.map(name => {
  const group = groupDefinitions.find(([, , pattern]) => pattern.test(name));
  if (!group) throw new Error(`Ungrouped property: ${name}`);
  const declaration = declarations.get('lv_style_set_' + name);
  const type = declaration ? declaration.signature.match(/, (.+?) value\);$/)?.[1] : 'lv_style_value_t (generic API)';
  if (!type) throw new Error(`Missing type: ${name}`);
  return { name, enum: 'LV_STYLE_' + name.toUpperCase(), group: group[0], type, typed: Boolean(declaration) };
}).sort((a, b) => groupDefinitions.findIndex(g => g[0] === a.group) - groupDefinitions.findIndex(g => g[0] === b.group) || propertyNames.indexOf(a.name) - propertyNames.indexOf(b.name));
const propertySet = new Set(properties.map(p => p.name));
const typedSet = new Set(typedProperties);

// Follow only public mutating wrappers, not layout refreshes/getters/internal computations.
function assignedProperties(name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  // Both public fade helpers animate opacity through fade_anim_cb (lv_obj_style.c).
  if (name === 'lv_obj_fade_in' || name === 'lv_obj_fade_out') return new Set(['opa']);
  const direct = name.match(/^lv_(?:obj_set_style|style_set)_(.+)$/)?.[1];
  if (typedSet.has(direct)) return new Set([direct]);
  const body = definitions.get(name);
  const result = new Set();
  if (!body) return result;
  for (const match of body.matchAll(/\b(lv_(?:style_set_|obj_set_style_|obj_set_(?:pos|x\b|y\b|size|width|height|align|layout|content_|flex_|grid_)|obj_align\b|obj_align_to\b|obj_center\b)\w*)\s*\(/g)) {
    for (const property of assignedProperties(match[1], new Set(seen))) result.add(property);
  }
  return result;
}
const genericNotes = {
  lv_style_set_prop: 'Устанавливает одно выбранное prop; галочки означают допустимый выбор, не одновременную запись всех свойств.',
  lv_obj_set_local_style_prop: 'Устанавливает одно выбранное prop для selector (часть + состояние).',
  lv_style_copy: 'Копирует свойства src в dst с предварительным сбросом dst. Галочка: свойство может присутствовать в src.',
  lv_style_merge: 'Добавляет/перезаписывает свойства из src; остальные свойства dst сохраняет.',
  lv_obj_add_style: 'Подключает общий стиль к selector; свойства берутся из переданного style, локальные значения не переписываются.',
  lv_obj_replace_style: 'Заменяет подключённый общий стиль. Возможные свойства определяются old_style/new_style.',
};
const rows = [];
for (const [name, declaration] of declarations) {
  const isGeneric = name in genericNotes;
  const supported = assignedProperties(name);
  const candidate = /^(?:lv_style_set_|lv_obj_set_style_|lv_obj_set_(?:pos|x$|y$|size|width|height|align|layout|content_|flex_|grid_)|lv_obj_align$|lv_obj_align_to$|lv_obj_center$|lv_obj_fade_(?:in|out)$)/.test(name);
  if (!isGeneric && (!candidate || !supported.size)) continue;
  for (const property of supported) if (!propertySet.has(property)) throw new Error(`Unknown property in ${name}: ${property}`);
  const family = isGeneric ? 'generic' : name.startsWith('lv_style_set_') ? 'shared' : name.startsWith('lv_obj_set_style_') ? 'local' : 'helper';
  let note = genericNotes[name] || (family === 'shared' ? 'Свойства общего lv_style_t.' : family === 'local' ? 'Локальные свойства объекта для selector.' : 'Составная функция / сокращение API объекта; галочки показывают записываемые свойства.');
  if (/flex|grid/.test(name)) note += ' Доступность зависит от LV_USE_FLEX / LV_USE_GRID.';
  if (name === 'lv_obj_align_to') note += ' Вычисляет координаты относительно base; не создаёт постоянную привязку к нему.';
  if (name.startsWith('lv_obj_set_content_')) note += ' Учитывает текущие отступы и границы при вычислении внешнего размера.';
  if (name === 'lv_obj_fade_in' || name === 'lv_obj_fade_out') note = 'Анимирует локальное opa через fade_anim_cb; time/delay — параметры анимации, не свойства anim_duration/transition. Fade-in по завершении удаляет временное локальное opa.';
  rows.push({ ...declaration, family, note, properties: isGeneric ? properties.map(p => p.name) : [...supported] });
}
const familyNames = { shared: 'Общий стиль · lv_style_t', local: 'Локальный стиль · объект + selector', helper: 'Составные функции и сокращения', generic: 'Универсальные функции и подключение стилей' };
const familyOrder = ['shared', 'local', 'helper', 'generic'];
rows.sort((a, b) => familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family) || declarations.get(a.name).path.localeCompare(declarations.get(b.name).path) || a.line - b.line);
for (const property of typedProperties) {
  if (!rows.some(r => r.name === 'lv_style_set_' + property)) throw new Error(`Missing shared setter: ${property}`);
  if (!rows.some(r => r.name === 'lv_obj_set_style_' + property)) throw new Error(`Missing local setter: ${property}`);
}
for (const name of ['lv_style_set_pad_all', 'lv_obj_set_style_size', 'lv_obj_set_size', 'lv_obj_set_flex_align', 'lv_obj_set_grid_cell']) {
  if (!rows.some(r => r.name === name)) throw new Error(`Missing helper: ${name}`);
}
const sourceManifest = [...sources].map(([path, content]) => ({ path, url: `https://github.com/lvgl/lvgl/blob/${version}/${path}`, sha256: createHash('sha256').update(content).digest('hex') }));
function parameterTypes(signature) {
  const parameters = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
  if (!parameters || parameters === 'void') return [];
  return parameters.split(',').map(parameter => {
    const match = parameter.trim().match(/^(.*?)\b[A-Za-z_]\w*\s*(\[[^\]]*\])?$/);
    if (!match || !match[1].trim()) throw new Error(`Unsupported parameter: ${parameter}`);
    // In function parameters, T name[] is a pointer to T. Retain typedefs and const.
    return normalize(match[1] + (match[2] ? ' *' : '')).replace(/\s*\*/g, ' *');
  });
}
const signatureMap = new Map();
for (const row of rows) {
  row.parameterTypes = parameterTypes(row.signature);
  row.returnType = row.signature.slice(0, row.signature.indexOf(row.name)).trim();
  const key = row.parameterTypes.join(', ');
  const groupKey = [row.family, row.returnType, key].join('|');
  if (!signatureMap.has(groupKey)) signatureMap.set(groupKey, {
    family: row.family, returnType: row.returnType, parameterTypes: row.parameterTypes, key,
    cSignature: row.signature.replace(row.name + '(', '(*fn)('), functions: [],
  });
  signatureMap.get(groupKey).functions.push(row.name);
}
const signatureGroups = [...signatureMap.values()].sort((a, b) => familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family) || b.functions.length - a.functions.length || a.key.localeCompare(b.key) || a.returnType.localeCompare(b.returnType));
const nextSignatureByFamily = new Map();
const sharedAbi=JSON.parse(await readFile(new URL('contracts/style-api-v2.json',root),'utf8'));
signatureGroups.forEach((group, index) => {
  group.id = group.family==='shared' ? sharedAbi.signatures.find(s=>JSON.stringify(s.parameters)===JSON.stringify(group.parameterTypes.slice(1)))?.id : undefined;
  if(group.id===undefined)group.id=Math.max(nextSignatureByFamily.get(group.family)||0,group.family==='shared'?Math.max(...sharedAbi.signatures.map(s=>s.id))+1:0);
  nextSignatureByFamily.set(group.family, group.id + 1);
  group.familyKey = `${group.family}:${group.id}`;
  group.order = index;
  group.functions.sort((a, b) => a.localeCompare(b));
});
const groupOrder = new Map(signatureGroups.flatMap(group => group.functions.map(name => [name, group.order])));
rows.sort((a, b) => groupOrder.get(a.name) - groupOrder.get(b.name) || a.name.localeCompare(b.name));
if (signatureGroups.reduce((sum, group) => sum + group.functions.length, 0) !== rows.length) throw new Error('Signature groups lost functions');
const data = { version, scope: 'Built-in LVGL style properties; public setters, style-related wrappers and generic style assignment APIs. Configuration-conditional union; no widget content setters, getters, legacy aliases or custom properties.', groups: groupDefinitions.map(([id, name]) => ({ id, name })), properties, rows, signatureGroups, sources: sourceManifest };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sourceLink = row => `https://github.com/lvgl/lvgl/blob/${version}/${row.path}#L${row.line}`;
const columnHeaders = properties.map(p => `<th scope="col" data-property="${p.name}" data-group="${p.group}" class="property"><button type="button" class="property-name" data-select-property="${p.name}" aria-label="Показать функции для ${p.name}">${p.name}</button></th>`).join('');
const groupHeaders = data.groups.map(g => `<th scope="colgroup" class="property-group" data-group="${g.id}" colspan="${properties.filter(p => p.group === g.id).length}">${g.name}</th>`).join('');
let lastFamily = '';
const bodyRows = rows.map(row => {
  const section = row.family !== lastFamily ? `<tr class="family-heading" data-family="${row.family}"><th colspan="${properties.length + 1}">${familyNames[row.family]}</th></tr>` : '';
  lastFamily = row.family;
  const cells = properties.map(p => `<td data-property="${p.name}" data-group="${p.group}"${row.properties.includes(p.name) ? ` class="yes" aria-label="${row.name}: ${p.name}"` : ''}>${row.properties.includes(p.name) ? '✓' : ''}</td>`).join('');
  return `${section}<tr data-function="${row.name}" data-family="${row.family}"><th scope="row" class="signature"><a href="${sourceLink(row)}" target="_blank" rel="noopener">${escape(row.signature)}</a><span class="row-note">${escape(row.note)}</span></th>${cells}</tr>`;
}).join('\n');
const sourceList = sourceManifest.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.path}</a></li>`).join('');
function signatureTableRows(groups) {
  return familyOrder.map(family => {
    const familyGroups = groups.filter(group => group.family === family);
    return familyGroups.map((group, index) => {
      const names = group.functions.map(name => {
        const row = rows.find(row => row.name === name);
        return `<a href="${sourceLink(row)}" target="_blank" rel="noopener">${escape(name)}</a>`;
      }).join(', ');
      return `<tr data-signature-group="${group.familyKey}" data-signature-family="${family}">${index === 0 ? `<th scope="rowgroup" rowspan="${familyGroups.length}" class="type-family">${escape(familyNames[family])}</th>` : ''}<th scope="row" class="type-group-id"><span class="number-value">${group.id}</span></th><td class="type-parameter-count"><span class="number-value">${group.parameterTypes.length}</span></td><td class="type-group"><code>${escape(group.cSignature)}</code></td><td class="type-count"><span class="number-value">${group.functions.length}</span></td><td class="type-function">${names}</td></tr>`;
    }).join('\n');
  }).join('\n');
}
const signatureBody = signatureTableRows(signatureGroups);
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LVGL 9.6 · Стили и группы сигнатур</title>
<style>
:root{color-scheme:light;--page:#f4f0e6;--surface:#fffdf7;--head:#e6e0d2;--line:#d1ccbf;--text:#272b2e;--muted:#5c6265;--accent:#17604a;--hit:#e4eee5;--hover:#edf0e9;--signature-width:700px;--cell-width:34px;font-family:Segoe UI,Arial,sans-serif;font-size:13px}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--text);height:100dvh;display:flex;flex-direction:column;overflow:hidden}header{padding:7px 10px 5px;border-bottom:1px solid var(--line);flex:none}h1{font-size:17px;margin:0 0 4px;font-weight:650}p{margin:3px 0;line-height:1.35}a{color:var(--accent)}.toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--line);flex:none}label{display:flex;align-items:center;gap:5px}input,select,button{font:inherit;border:1px solid #aaa89e;border-radius:2px;background:var(--surface);color:var(--text);padding:3px 6px}input[type=search]{width:190px}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.count{font-variant-numeric:tabular-nums;color:var(--muted);margin-left:auto}main{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;background:var(--surface)}table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:max-content;min-width:100%}col.function-col{width:var(--signature-width)}col.prop-col{width:var(--cell-width)}th,td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:2px 3px;text-align:center}thead th{position:sticky;background:var(--head);z-index:4}.property-group{top:0;height:29px;font-weight:600;white-space:nowrap;font-size:12px;overflow:hidden}.corner{left:0;top:0;z-index:7;text-align:left;vertical-align:bottom;padding:7px;min-width:var(--signature-width);max-width:var(--signature-width)}.corner p{font-weight:400;font-size:12px;color:var(--muted)}.property{top:29px;height:244px;padding:4px 0;width:var(--cell-width);vertical-align:bottom}.property-name{writing-mode:vertical-rl;transform:rotate(180deg);border:0;padding:3px 5px;background:transparent;white-space:nowrap;font-family:Consolas,monospace;font-size:12px;font-weight:600;line-height:22px}.property.selected{background:#cee1d6}.signature{position:sticky;left:0;z-index:2;background:var(--surface);width:var(--signature-width);min-width:var(--signature-width);max-width:var(--signature-width);text-align:left;font-weight:400;padding:3px 7px}.signature a{font:12px/1.3 Consolas,monospace;overflow-wrap:anywhere;text-decoration:none;color:var(--text)}.signature a:hover{text-decoration:underline}.row-note{display:none;color:var(--muted);font:12px/1.3 Segoe UI,Arial,sans-serif;margin-top:3px}body.show-notes .row-note{display:block}td{height:23px;font-size:14px;width:var(--cell-width)}td.yes{color:var(--accent);font-weight:700;background:var(--hit)}tbody tr[data-function]:hover td,tbody tr[data-function]:hover th{background:var(--hover)}.family-heading th{background:var(--head);text-align:left;padding:4px 7px;height:25px}.family-heading th::first-letter{font-weight:bold}.family-heading{font-weight:600}details{font-size:12px}summary{cursor:pointer;color:var(--accent)}details .details-content{max-height:30vh;overflow:auto;padding:4px 0}ul{margin:3px 0;padding-left:20px}.sources{columns:2;max-width:1100px}.legend{font-size:12px;color:var(--muted)}.empty{padding:15px}footer{padding:4px 10px;font-size:12px;border-top:1px solid var(--line);flex:none}.property-info{color:var(--muted);font-size:12px;min-height:17px}[hidden]{display:none!important}@media(max-width:800px){:root{--signature-width:430px}input[type=search]{width:145px}.sources{columns:1}.count{margin-left:0}}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--page:#1d2225;--surface:#242a2d;--head:#323b3e;--line:#465154;--text:#e2e7e5;--muted:#b4c0be;--accent:#9bd7bb;--hit:#293e35;--hover:#35423b}.property.selected{background:#3c5b4b}}
.tabs{display:flex;gap:3px;padding:5px 10px 0;border-bottom:1px solid var(--line);flex:none}.tabs button{padding:5px 10px;border-bottom:0;border-radius:2px 2px 0 0;background:var(--page)}.tabs button[aria-selected=true]{background:var(--surface);font-weight:650;border-color:var(--accent);box-shadow:inset 0 2px var(--accent)}.tab-panel{display:flex;flex-direction:column;flex:1;min-height:0}.group-scroll{overflow:auto;min-height:0;flex:1;overscroll-behavior:contain;background:var(--surface)}.signature-table{width:100%;min-width:1050px;table-layout:auto}.signature-table thead th{top:0;height:30px;text-align:left;padding:5px 7px}.signature-table tbody td,.signature-table tbody th{width:auto;font-size:12px;line-height:1.35;padding:3px 7px;text-align:left;vertical-align:top;font-weight:400}.signature-table .type-group-id{font-variant-numeric:tabular-nums;text-align:right;background:var(--head);font-weight:600}.signature-table .type-group{width:1%;white-space:nowrap;background:var(--hover)}.signature-table .type-group code{font:12px/1.45 Consolas,monospace;white-space:nowrap;overflow-wrap:normal;word-break:normal}.signature-table .type-count{text-align:right;font-variant-numeric:tabular-nums;background:var(--hover)}.signature-table .type-function{font:12px/1.65 Consolas,monospace}.signature-table .type-function a{color:var(--text);text-decoration:none;white-space:nowrap}.signature-table .type-function a:hover{text-decoration:underline}.signature-table .type-family{font-size:12px;background:var(--head);font-weight:600}.group-explanation{padding:5px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line)}
.signature-table .numeric-heading{text-align:center;white-space:nowrap;padding-inline:4px}.signature-table .type-group-id,.signature-table .type-parameter-count,.signature-table .type-count{text-align:center;font-variant-numeric:tabular-nums lining-nums}.signature-table .type-parameter-count{background:var(--head);padding-inline:4px;font-weight:600}.signature-table .number-value{display:inline-block;min-width:2ch;text-align:right;font:12px/1.35 Consolas,monospace;font-variant-numeric:tabular-nums lining-nums}.signature-table .type-count .number-value{min-width:3ch}
</style></head><body>
<header><h1>LVGL 9.6.0 · Свойства стилей × функции настройки</h1><p class="legend">✓ — функция может задать / применить свойство. Все встроенные свойства, включая условно доступные Flex/Grid; имена LVGL, а не CSS. Нажмите название свойства, чтобы оставить подходящие функции.</p>
<details><summary>Область охвата, условия галочек и источники</summary><div class="details-content"><p>Верхние объединённые заголовки группируют свойства. Строки содержат полные сигнатуры C с типами параметров. selector задаёт часть и состояние. Включены парные setter-функции общего/локального стиля, составные обёртки, общий set_prop, копирование/слияние и подключение стилей.</p><p>Для универсальных функций галочка означает возможное свойство: set_prop меняет одно выбранное prop, copy/merge/add/replace работают со свойствами переданного стиля. Это не утверждение, что один вызов устанавливает все столбцы. Обёртки размеров/выравнивания отмечены по реально вызываемым setter-функциям. Зависимости, чтение свойств и косвенный перерасчёт геометрии галочками не отмечаются.</p><p>Не включены getter-функции, удаление/сброс, refresh/invalidate, настройки содержимого виджетов, flags/states как отдельные свойства, макросы и старые совместимые алиасы. Пользовательские свойства регистрируются динамически и не имеют конечного списка. Наличие свойства не гарантирует, что конкретная часть конкретного виджета его рисует.</p><p>Функции и типы извлечены из исходников тега ${version}; связи составных обёрток проверяются по вызовам setter-функций. Полный набор не ограничен конфигурацией одной платы. Генератор: tools/build_style_matrix.mjs. Снимок данных и SHA-256 исходников: <a href="style_matrix_lvgl_9_6.data.json">JSON</a>.</p><ul class="sources">${sourceList}</ul></div></details></header>
<div class="tabs" role="tablist" aria-label="Представления API стилей"><button id="matrix-tab" type="button" role="tab" aria-controls="matrix-panel" aria-selected="true">Матрица свойств</button><button id="signatures-tab" type="button" role="tab" aria-controls="signatures-panel" aria-selected="false">Группы по параметрам · ${signatureGroups.length}</button></div>
<section id="matrix-panel" class="tab-panel" role="tabpanel" aria-labelledby="matrix-tab"><div class="toolbar"><label>Функция <input id="function-filter" type="search" placeholder="pad_all, set_size…"></label><label>Свойство <input id="property-filter" type="search" placeholder="bg_, text_, width…"></label><label>Группа <select id="group-filter"><option value="">Все группы</option>${data.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}</select></label><label>API <select id="family-filter"><option value="">Все функции</option>${familyOrder.map(f => `<option value="${f}">${familyNames[f]}</option>`).join('')}</select></label><label><input type="checkbox" id="notes">Пояснения</label><button id="reset" type="button">Сбросить</button><span class="count" id="counts" role="status"></span></div>
<main id="matrix-scroll" aria-label="Матрица стилей с горизонтальной и вертикальной прокруткой"><table id="matrix"><caption hidden>Все встроенные свойства стилей LVGL 9.6.0 и функции их настройки. Галочки отмечают соответствия.</caption><colgroup><col class="function-col">${properties.map(p => `<col class="prop-col" data-property="${p.name}" data-group="${p.group}">`).join('')}</colgroup><thead><tr id="group-row"><th rowspan="2" scope="col" class="corner">Функция и параметры<p>lv_style_t — общий стиль<br>lv_obj_t + selector — локальное оформление</p><div id="property-info" class="property-info">${properties.length} свойств · ${rows.length} функций</div></th>${groupHeaders}</tr><tr>${columnHeaders}</tr></thead><tbody>${bodyRows}</tbody></table><div id="empty" class="empty" hidden>Нет подходящих функций. Измените фильтры.</div></main><footer>✓ — возможность назначения, а не применимость ко всем виджетам. Начальный вид показывает весь набор. Галочки универсальных строк зависят от аргументов.</footer>
</section><section id="signatures-panel" class="tab-panel" role="tabpanel" aria-labelledby="signatures-tab" hidden><div class="toolbar"><label>Типы / функция <input id="signature-filter" type="search" placeholder="int32_t, lv_opa_t, pad_all…"></label><label>API <select id="signature-family-filter"><option value="">Все функции</option>${familyOrder.map(f => `<option value="${f}">${familyNames[f]}</option>`).join('')}</select></label><label><input id="multiple-only" type="checkbox">Только группы от 2 функций</label><button id="signature-reset" type="button">Сбросить</button><span id="signature-counts" class="count" role="status"></span></div><div class="group-explanation">Каждое семейство API имеет собственную нумерацию сигнатур от 0. Колонка «Парам.» считает все параметры полной C-сигнатуры, включая style/obj и selector. Семейство выбирается контекстом; одинаковый номер в разных семействах не означает совместимость. fn — условное имя указателя функции; имена параметров взяты из первой функции группы и на группировку не влияют. Возвращаемый тип, порядок типов, const и typedef сохранены; T name[] в параметре эквивалентен T *.</div><div class="group-scroll"><table class="signature-table" id="signature-table"><colgroup><col style="width:160px"><col style="width:60px"><col style="width:46px"><col class="signature-col"><col style="width:48px"><col></colgroup><thead><tr><th scope="col">Семейство API</th><th scope="col" class="numeric-heading">№ сигн.</th><th scope="col" class="numeric-heading">Парам.</th><th scope="col">Сигнатура C</th><th scope="col" class="numeric-heading">Кол.</th><th scope="col">Функции</th></tr></thead><tbody id="signature-body">${signatureBody}</tbody></table><div id="signature-empty" class="empty" hidden>Нет подходящих групп.</div></div><footer>Порядок: семейство API → собственный номер сигнатуры от 0 → имена функций по алфавиту. Номера других семейств справочные. ABI v2 общего стиля закреплён отдельно в contracts/style-api-v2.json; сортировка справочника его не меняет. В первой вкладке строки следуют этому же порядку. Общая сигнатура не отменяет единицы, диапазоны и проверку значений.</footer></section>
<script type="application/json" id="matrix-data">${json}</script><script>
const data=JSON.parse(document.getElementById('matrix-data').textContent);
const functionFilter=document.getElementById('function-filter'),propertyFilter=document.getElementById('property-filter'),groupFilter=document.getElementById('group-filter'),familyFilter=document.getElementById('family-filter');
let selectedProperty='';
function render(){
const fq=functionFilter.value.trim().toLowerCase(),pq=propertyFilter.value.trim().toLowerCase(),group=groupFilter.value,family=familyFilter.value;
const visibleProperties=data.properties.filter(p=>(!group||p.group===group)&&(!pq||p.name.includes(pq)));
const visibleNames=new Set(visibleProperties.map(p=>p.name));
document.querySelectorAll('[data-property]').forEach(el=>el.hidden=!visibleNames.has(el.dataset.property));
document.querySelectorAll('.property-group').forEach(el=>{const n=visibleProperties.filter(p=>p.group===el.dataset.group).length;el.hidden=!n;if(n)el.colSpan=n;});
const familyCounts={};let count=0;
document.querySelectorAll('tr[data-function]').forEach(el=>{const row=data.rows.find(r=>r.name===el.dataset.function);const visible=(!fq||row.signature.toLowerCase().includes(fq))&&(!family||row.family===family)&&(!selectedProperty||row.properties.includes(selectedProperty))&&row.properties.some(p=>visibleNames.has(p));el.hidden=!visible;if(visible){count++;familyCounts[row.family]=(familyCounts[row.family]||0)+1;}});
document.querySelectorAll('.family-heading').forEach(el=>{el.hidden=!familyCounts[el.dataset.family];el.firstElementChild.colSpan=visibleProperties.length+1;});
document.querySelectorAll('.property').forEach(el=>el.classList.toggle('selected',el.dataset.property===selectedProperty));
document.getElementById('counts').textContent=count+' / '+data.rows.length+' функций · '+visibleProperties.length+' / '+data.properties.length+' свойств';
document.getElementById('empty').hidden=Boolean(count&&visibleProperties.length);
const p=data.properties.find(p=>p.name===selectedProperty);document.getElementById('property-info').textContent=p?p.enum+' · '+p.type+(p.typed?'':' · только generic API'):'Выбранное свойство: все';
}
[functionFilter,propertyFilter].forEach(el=>el.addEventListener('input',render));[groupFilter,familyFilter].forEach(el=>el.addEventListener('change',render));
document.getElementById('notes').addEventListener('change',event=>document.body.classList.toggle('show-notes',event.target.checked));
document.querySelectorAll('[data-select-property]').forEach(button=>button.addEventListener('click',()=>{selectedProperty=selectedProperty===button.dataset.selectProperty?'':button.dataset.selectProperty;render();}));
document.getElementById('reset').addEventListener('click',()=>{functionFilter.value='';propertyFilter.value='';groupFilter.value='';familyFilter.value='';selectedProperty='';render();});render();
const rows=data.rows;
const familyNames=${JSON.stringify(familyNames)};
const familyOrder=${JSON.stringify(familyOrder)};
const version=data.version;
const escape=${escape.toString()};
const sourceLink=${sourceLink.toString()};
const signatureTableRows=${signatureTableRows.toString()};
const signatureFilter=document.getElementById('signature-filter'),signatureFamily=document.getElementById('signature-family-filter'),multipleOnly=document.getElementById('multiple-only');
function renderSignatureGroups(){
 const query=signatureFilter.value.trim().toLowerCase(),family=signatureFamily.value;
 const groups=data.signatureGroups.map(group=>({...group,functions:group.functions.filter(name=>{const row=data.rows.find(row=>row.name===name);return (!family||row.family===family)&&(!query||group.key.toLowerCase().includes(query)||row.signature.toLowerCase().includes(query));})})).filter(group=>group.functions.length>=(multipleOnly.checked?2:1));
 document.getElementById('signature-body').innerHTML=signatureTableRows(groups);
 document.getElementById('signature-counts').textContent=groups.length+' / '+data.signatureGroups.length+' групп · '+groups.reduce((sum,group)=>sum+group.functions.length,0)+' / '+data.rows.length+' функций';
 document.getElementById('signature-empty').hidden=Boolean(groups.length);
}
signatureFilter.addEventListener('input',renderSignatureGroups);signatureFamily.addEventListener('change',renderSignatureGroups);multipleOnly.addEventListener('change',renderSignatureGroups);
document.getElementById('signature-reset').addEventListener('click',()=>{signatureFilter.value='';signatureFamily.value='';multipleOnly.checked=false;renderSignatureGroups();});renderSignatureGroups();
const tabs=[document.getElementById('matrix-tab'),document.getElementById('signatures-tab')];
function selectTab(tab){for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));document.getElementById(item.getAttribute('aria-controls')).hidden=!active;}}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;selectTab(tabs[next]);tabs[next].focus();});});
</script></body></html>`;
await mkdir(new URL('docs/', root), { recursive: true });
await writeFile(new URL('docs/style_matrix_lvgl_9_6.html', root), html, 'utf8');
await writeFile(new URL('docs/style_matrix_lvgl_9_6.data.json', root), JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ properties: properties.length, typedProperties: typedProperties.length, functions: rows.length, parameterGroups: signatureGroups.length, families: Object.fromEntries(familyOrder.map(f => [f, rows.filter(r => r.family === f).length])), genericOnly: properties.filter(p => !p.typed).map(p => p.name), output: fileURLToPath(new URL('docs/style_matrix_lvgl_9_6.html', root)) }, null, 2));
