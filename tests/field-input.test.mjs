// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readNumberInput,commitNumberInput,commitColorInput,toggleFlags,stepDimensionText} from '../frontend/src/field-input.js';
test('empty unsets, zero stays set, partial and invalid numeric edits do not commit',()=>{
 const input=(value,number,valid=true,badInput=false)=>({value,valueAsNumber:number,validity:{valid,badInput}});
 assert.deepEqual(readNumberInput(input('',NaN)),{accepted:true,value:undefined});
 assert.deepEqual(readNumberInput(input('0',0)),{accepted:true,value:0});
 assert.deepEqual(readNumberInput(input('-12',-12)),{accepted:true,value:-12});
 for(const value of [input('',NaN,false,true),input('1.5',1.5),input('256',256,false)])assert.equal(readNumberInput(value).accepted,false);
 const committed=[];commitNumberInput({target:input('0',0)},v=>committed.push(v));
 commitNumberInput({target:input('',NaN)},v=>committed.push(v));
 assert.deepEqual(committed,[0,undefined]);
});
test('color entry validates without silently changing an invalid value',()=>{
 const committed=[],errors=[];
 const target={value:'#ab12Ef',setCustomValidity:value=>errors.push(value),reportValidity:()=>false};
 assert.equal(commitColorInput({target},v=>committed.push(v)),true);
 target.value='#badhex';assert.equal(commitColorInput({target},v=>committed.push(v)),false);
 target.value='';assert.equal(commitColorInput({target},v=>committed.push(v)),true);
 assert.deepEqual(committed,['#ab12Ef',undefined]);assert.ok(errors.includes('Формат #RRGGBB'));
});
test('flag updates preserve other selected flags, with explicit zero supported',()=>{
 assert.equal(toggleFlags(3,4,true),7);assert.equal(toggleFlags(7,2,false),5);assert.equal(toggleFlags(7,0,true),0);
});
test('dimension wheel steps preserve percentages, handle empty zero, and leave content or partial edits alone',()=>{
 assert.equal(stepDimensionText('',1),'1');assert.equal(stepDimensionText('',-1),'-1');
 assert.equal(stepDimensionText('0',-1),'-1');assert.equal(stepDimensionText('60',10),'70');
 assert.equal(stepDimensionText('100%',-1),'99%');assert.equal(stepDimensionText('12.5%',1),'13.5%');
 assert.equal(stepDimensionText('2147483647',1),'2147483647');
 for(const value of ['content','-','20p','1.5'])assert.equal(stepDimensionText(value,1),undefined);
});
