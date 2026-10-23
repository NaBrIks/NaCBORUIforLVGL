// Locally authored, explanatory SVG diagrams; no external assets or HTML input.
const sections={
 'Геометрия':{intro:'Где находится объект, сколько места занимает и как расположено содержимое.',items:['size / min / max — размеры и их ограничения.','pos / align — положение относительно родителя.','transform — масштаб, поворот и смещение рисунка.','padding — внутри объекта; margin — снаружи; gap — между дочерними объектами.'],note:'Поворот и масштаб не равны изменению размеров в компоновке.'},
 'Оформление':{intro:'Как выглядит поверхность объекта и её края.',items:['background — заливка, градиент и фоновое изображение.','border — рамка внутри прямоугольника.','outline — внешний контур с отдельным зазором.','shadow — тень прямоугольника; drop_shadow — тень фактической формы, например букв.'],note:'Для видимой тени формы нужно drop_shadow_opa > 0; по умолчанию это 0.'},
 'Графика и текст':{intro:'Как рисуются изображение, штрих линии, дуга и символы текста.',items:['image — цвет и непрозрачность изображения виджета Image.','line — толщина, пунктир, цвет и окончания линии.','arc — толщина кольцевого штриха, его цвет и окончания.','text — шрифт, интервалы, выравнивание и обводка букв.'],note:'Эти свойства не создают виджеты. На текущем Label виден текст; line / arc / image требуют соответствующего элемента рисования.'},
 'Эффекты и анимация':{intro:'Как рисунок смешивается с фоном и изменяется во времени.',items:['opa — непрозрачность; layered — обработка как единого слоя.','blur — размытие объекта или фона за ним.','recolor / filter / blend — изменение и смешивание цветов.','transition / anim — зарегистрированные переходы и шаблоны анимации.'],note:'Размытие и слои требуют памяти. Transition относится к смене состояния, а не автоматически к каждому шагу колеса.'},
 'Компоновка':{intro:'Как родитель размещает дочерние объекты и как ребёнок занимает место в контейнере.',items:['layout — выбранный алгоритм компоновки.','Flex — поток строкой или колонкой, перенос и распределение свободного места.','Grid — строки и колонки, положение и размер ячейки ребёнка.','base_dir — направление; rotary_sensitivity — ввод от вращателя LVGL.'],note:'На одиночном Label без дочерних объектов параметры контейнера могут не дать видимого эффекта.'}
};
const ns='http://www.w3.org/2000/svg';
function svgNode(tag,attrs,text){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text)node.textContent=text;return node;}
function diagram(name){
 const svg=svgNode('svg',{viewBox:'0 0 336 132',role:'img','aria-label':'Схема: '+name});
 const add=(tag,attrs,text)=>svg.append(svgNode(tag,attrs,text));
 const box=(x,y,w,h,cls='help-shape')=>add('rect',{x,y,width:w,height:h,rx:3,class:cls});
 const label=(x,y,text)=>add('text',{x,y,class:'help-label'},text);
 const line=(x1,y1,x2,y2,cls='help-stroke')=>add('line',{x1,y1,x2,y2,class:cls});
 if(name==='Геометрия'){
  box(44,22,248,88,'help-margin');box(64,40,208,54,'help-padding');box(87,56,162,23,'help-content');
  label(50,16,'margin · снаружи');label(69,52,'padding');label(119,72,'содержимое');
  line(44,118,292,118);label(133,130,'width / X');line(307,22,307,110);label(312,72,'Y');
 }else if(name==='Оформление'){
  box(90,36,166,76,'help-shadow');box(71,15,178,88,'help-outline');box(80,24,160,70,'help-content');
  add('rect',{x:80,y:24,width:160,height:70,rx:3,class:'help-border'});label(109,65,'background');
  label(3,14,'outline');line(48,15,71,22);label(256,30,'border');line(251,32,240,40);label(248,122,'shadow');line(256,111,272,116);
 }else if(name==='Графика и текст'){
  box(12,16,60,48);add('path',{d:'M17 57 L34 35 L46 48 L58 29 L68 57',class:'help-stroke'});
  line(97,40,164,40);add('path',{d:'M198 61 A27 27 0 0 1 252 61',class:'help-accent-stroke'});
  label(276,50,'Aa');label(16,91,'image');label(110,91,'line');label(212,91,'arc');label(278,91,'text');label(18,120,'Отдельные элементы рисования');
 }else if(name==='Эффекты и анимация'){
  box(14,29,72,56,'help-shadow');box(132,29,72,56,'help-padding');box(250,29,72,56,'help-content');
  label(31,63,'0%');label(147,63,'50%');label(260,63,'100%');line(89,57,126,57);line(207,57,244,57);
  label(28,113,'состояние A → переход во времени → B');
 }else{
  label(18,19,'Flex · поток');for(let i=0;i<3;i++){box(18+i*38,33,30,28,'help-content');label(27+i*38,52,String(i+1));}
  label(203,19,'Grid · ячейки');for(let y=0;y<2;y++)for(let x=0;x<3;x++)box(200+x*37,33+y*34,30,28,'help-padding');
  label(18,112,'родитель → расположение детей');
 }
 return svg;
}
export function renderSectionHelp(name){
 const content=sections[name];if(!content)return null;
 const root=document.createElement('div');root.className='section-help';
 const title=document.createElement('strong');title.className='section-help-title';title.textContent=name;
 const intro=document.createElement('p');intro.textContent=content.intro;
 const list=document.createElement('ul');for(const text of content.items){const li=document.createElement('li');li.textContent=text;list.append(li);}
 const note=document.createElement('p');note.className='section-help-note';note.textContent=content.note;
 root.append(title,intro,diagram(name),list,note);return root;
}
