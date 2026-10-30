// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {styleFields} from '../frontend/src/generated/style-fields.js';
import {propertyDescription,describeField} from '../frontend/src/style-help.js';
test('every editor property has a concise explanation and its exact type',()=>{
 for(const field of styleFields){assert.ok(propertyDescription(field.name),field.name);assert.ok(describeField(field).includes(field.type),field.name);}
});
test('tooltips distinguish widget applicability and the disabled drop-shadow default',()=>{
 const help=name=>describeField(styleFields.find(f=>f.name===name));
 assert.match(help('drop_shadow_opa'),/по умолчанию/);
 assert.match(help('line_width'),/Label/);
 assert.match(help('arc_width'),/Label/);
 assert.match(help('length'),/не заменяет width\/height/);
});
