// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {mkdirSync,writeFileSync} from 'node:fs';
import {encodeScreen,offlineCapabilities} from '@lvgl-cbor/screen-codec';
import {nativeDemo,extensions} from '../examples/native_widget/demo-screen.mjs';
import {storageProject,capabilities} from '../examples/s3_style_lab/project/demo.mjs';
import {appendShell,withSystemBindings,demoShellOptions} from '../examples/s3_style_lab/project/shell.mjs';
import {encodeProject} from '../packages/project-codec/index.js';
const caps={...offlineCapabilities(),extensions,availableWidgets:[...offlineCapabilities().availableWidgets,...extensions.map(w=>w.id)],resources:[{name:'montserrat_20',type:'const lv_font_t *'},{name:'montserrat_28',type:'const lv_font_t *'}]};
mkdirSync('local/native-widget-fixtures',{recursive:true});
writeFileSync('local/native-widget-fixtures/demo.cbor',encodeScreen(nativeDemo,'native-demo',caps));
writeFileSync('local/native-widget-fixtures/demo.json',JSON.stringify(nativeDemo,null,2)+'\n');
writeFileSync('local/native-widget-fixtures/capabilities.json',JSON.stringify(caps));
writeFileSync('local/native-widget-fixtures/layout.cbor',encodeProject(appendShell(storageProject,demoShellOptions),{...capabilities,binding:withSystemBindings(capabilities.binding)}));
