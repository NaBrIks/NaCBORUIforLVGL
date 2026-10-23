import test from 'node:test';
import assert from 'node:assert/strict';
import {importCss,exportCss,parseCss} from '../packages/css-codec/index.js';
import {createScreen} from '../frontend/src/screen-model.js';
import {encodeScreen} from '../packages/screen-codec/index.js';
import {encodeMethods} from '../packages/style-codec/index.js';
import {expandProperties} from '../packages/css-codec/values.js';
const style=()=>({scope:'screen',name:'css',props:{}});
const convert=(css,doc=style())=>importCss(css,{kind:'style',document:doc});
test('CSS dimensions, shorthands, colors, alpha, enums and fonts have real LVGL values',()=>{
 const r=convert('width:75%; height:fit-content; padding:1px 2px 3px 4px; margin:0; gap:6px 8px; background-color:rgba(16,32,48,0.5); color:#abc; border:2px solid red; opacity:0.8; font-size:28px; display:flex; flex-flow:row wrap; justify-content:space-between; text-align:center;');
 assert.equal(r.ok,true,JSON.stringify(r.diagnostics));const p=r.document.props;
 assert.deepEqual(p.width,{pct:75});assert.equal(p.height,'content');assert.equal(p.pad_left,4);assert.equal(p.pad_bottom,3);assert.equal(p.pad_column,8);assert.equal(p.bg_color,'#102030');assert.equal(p.bg_opa,128);assert.equal(p.text_color,'#aabbcc');assert.equal(p.border_color,'#ff0000');assert.equal(p.text_font,'montserrat_28');assert.ok(encodeMethods(p).size>10);
});
test('CSS applies specificity, important, source order, comma selectors, parts and states atomically',()=>{
 const doc=createScreen(),before=structuredClone(doc);
 const r=importCss('label { color: blue; } #title { color:red; } label { color:green; } #title { color:#123456 !important; } #title {color:white;} #level::indicator {background-color:#1a2b3c;} #level:pressed::indicator {opacity:0.5;} #title, #value {letter-spacing:2px;}',{document:doc});
 assert.equal(r.ok,true,JSON.stringify(r.diagnostics));assert.equal(r.document.root.children[0].style.text_color,'#123456');
 const level=r.document.root.children[1].children[1];assert.equal(level.styleRules.length,2);assert.equal(level.styleRules[0].part,'INDICATOR');assert.deepEqual(level.styleRules[1].state,['PRESSED']);
 assert.equal(r.document.root.children[1].children[0].style.text_color,'#008000');assert.deepEqual(doc,before);assert.ok(encodeScreen(r.document,'test').length);
});
test('declaration and selector errors block the entire import without partial mutations',()=>{
 const located=importCss('#root {\n  unsupported:1;\n}',{document:createScreen()});assert.equal(located.diagnostics[0].line,2);
 for(const css of ['width:-1px','height:-1%','top:fit-content','padding:-1px','padding-left:-1px','gap:-1px','font-size:0','font-size:16px'])assert.equal(convert(css).ok,false,css);
 const precedence=importCss('#title::main {color:red;} #title {color:blue;}',{document:createScreen()});assert.equal(precedence.ok,true);assert.equal(precedence.document.root.children[0].style.text_color,'#ff0000');
 for(const css of ['width:10em','color:no-such-color','width:calc(100% - 2px)','background-image:url(x)','@import "x";','padding:1px 2px 3px 4px 5px','width:1.5px','border:1px dashed red','opacity:2','font-weight:bold','height:12','background-color:rgb(999,0,0)','--x:1','color:red;broken','padding:','color:rgb(1,2,3','color:"red','/* unfinished']){
  const doc=style(),before=structuredClone(doc),r=convert(css,doc);assert.equal(r.ok,false,css);assert.equal(r.document,undefined,css);assert.ok(r.diagnostics.length);assert.deepEqual(doc,before);
 }
 for(const css of ['.card { color:red; }','obj label {color:red;}','#missing {color:red;}','#root:hover{color:red;}','#root{color:red; unsupported:1;}','#root{color:red;} garbage'])assert.equal(importCss(css,{document:createScreen()}).ok,false,css);
});
test('CSS export and import preserve supported screen/style appearance and selector rules',()=>{
 const doc=createScreen(),css=exportCss(doc),blank=structuredClone(doc);function clear(n){n.style={};for(const c of n.children??[])clear(c);}clear(blank.root);
 const r=importCss(css,{document:blank});assert.equal(r.ok,true,JSON.stringify(r.diagnostics));
 const normalize=n=>[Object.fromEntries(encodeMethods(expandProperties(n.style??{}))),...(n.children??[]).map(normalize)];assert.deepEqual(normalize(r.document.root),normalize(doc.root));
 const a=convert('width:34px; background-color:#abc8; color:blue; opacity:0.3; padding:3px; display:flex; flex-flow:column wrap-reverse;').document;
 const b=convert(exportCss(a,{kind:'style'})).document;assert.deepEqual(encodeMethods(a.props),encodeMethods(b.props));
});
test('CSS never loses unsupported LVGL properties, named styles or invalid selectors on export',()=>{
 assert.throws(()=>exportCss({props:{transform_rotation:123}},{kind:'style'}),/Outside CSS subset/);
 assert.throws(()=>exportCss({...createScreen(),styles:{test:{props:{}}}}),/named screen/);
 const doc=createScreen();doc.root.id='has spaces';assert.throws(()=>exportCss(doc),/ID cannot/);
 assert.throws(()=>exportCss({props:{bg_opa:128}},{kind:'style'}),/requires bg_color/);
 assert.throws(()=>exportCss({copy:'global:base',props:{color:'#fff'}},{kind:'style'}),/copy\/merge/);
 assert.throws(()=>exportCss({merge:['global:base'],props:{}},{kind:'style'}),/copy\/merge/);
 assert.throws(()=>exportCss({props:{width:-1}},{kind:'style'}),/CSS dimension/);
 assert.throws(()=>exportCss({props:{pad_left:-1}},{kind:'style'}),/Negative/);
 const font=convert('font-family:"name/*literal*/"');assert.equal(font.ok,true);assert.equal(font.document.props.text_font,'name/*literal*/');
 assert.equal(convert(exportCss(font.document,{kind:'style'})).document.props.text_font,'name/*literal*/');
});
test('bounded CSS rejects oversized/malformed nested input and reports resources against firmware',()=>{
 assert.throws(()=>parseCss('x'.repeat(262145)));assert.throws(()=>parseCss('#root {label {color:red;}}'));
 const r=importCss('font-family:missing_font',{kind:'style',document:style(),capabilities:{resources:[]}});assert.equal(r.ok,false);
 assert.equal(importCss('color:red',{kind:'style',document:{}}).ok,false);
 assert.equal(importCss('#root {color:red}',{document:{}}).ok,false);
 // Deterministic malformed input: no hangs, no eval, no exceptions escaping the result boundary.
 let seed=12345;for(let i=0;i<300;i++){let css='';for(let j=0;j<80;j++){seed=(seed*1664525+1013904223)>>>0;css+='{}:;()@#abc123"/*'[seed%16];}const r=importCss(css,{document:createScreen()});assert.equal(typeof r.ok,'boolean');}
});
