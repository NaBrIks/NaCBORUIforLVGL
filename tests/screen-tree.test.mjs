import test from 'node:test';
import assert from 'node:assert/strict';
import {canMoveNodeTo,moveNodeTo} from '../frontend/src/screen-model.js';
const node=(id,type='obj',children=[])=>({id,type,props:{},style:{},children});
const tree=()=>node('root','obj',[node('a','obj',[node('child','label')]),node('b','label'),node('c','button')]);
test('tree drag moves across parents, preserves objects and handles same-parent insertion indices',()=>{
 const root=tree(),b=root.children[1];assert.equal(moveNodeTo(root,'b','a','inside'),true);assert.equal(root.children[0].children[1],b);
 assert.equal(moveNodeTo(root,'b','c','after'),true);assert.deepEqual(root.children.map(n=>n.id),['a','c','b']);
 assert.equal(moveNodeTo(root,'b','a','before'),true);assert.deepEqual(root.children.map(n=>n.id),['b','a','c']);
 assert.equal(moveNodeTo(root,'b','c','before'),true);assert.deepEqual(root.children.map(n=>n.id),['a','b','c']);
});
test('tree drag rejects cycles, root moves, invalid destinations and no-op insertions atomically',()=>{
 const root=tree(),snapshot=structuredClone(root);
 for(const args of [['root','a','inside'],['a','child','after'],['a','a','inside'],['b','root','before'],['c','b','inside'],['missing','a','inside'],['b','c','before']]){
  assert.equal(canMoveNodeTo(root,...args),false,args.join('/'));assert.equal(moveNodeTo(root,...args),false);assert.deepEqual(root,snapshot);
 }
});
