import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
test('nested editor CSS has one definition per property within each selector block',async()=>{
 const source=await readFile(new URL('../frontend/src/design/editor.css',import.meta.url),'utf8');
 const root=postcss.parse(source);let nested=0;
 root.walkRules(rule=>{
  if(rule.parent.type==='rule')nested++;
  const properties=new Set();
  for(const node of rule.nodes){if(node.type!=='decl')continue;assert.ok(!properties.has(node.prop),`${rule.selector}: ${node.prop}`);properties.add(node.prop);}
 });
 assert.ok(nested>20,'expected native CSS nesting');
 assert.ok(!/property-table|geometry-corner/.test(source),'retired layout selectors must stay removed');
 for(const token of ['number-width','control-height','row-height','side-width','label-width'])assert.ok(source.includes('--editor-'+token));
});
