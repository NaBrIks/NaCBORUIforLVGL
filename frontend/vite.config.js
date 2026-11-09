// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {readFile} from 'node:fs/promises';
const referenceFiles={
 'widget_api_lvgl_9_6.html':'widget_api_lvgl_9_6.html',
 'widget_api_lvgl_9_6.data.json':'widget_api_lvgl_9_6.data.json',
 'style_matrix_lvgl_9_6.html':'style_matrix_lvgl_9_6.html'
};
function references(){return {
 name:'local-lvgl-references',
 async generateBundle(){for(const [fileName,file] of Object.entries(referenceFiles))this.emitFile({type:'asset',fileName:'reference/'+fileName,source:await readFile(new URL('../docs/'+file,import.meta.url))});}
};}
export default defineConfig({plugins:[vue(),references()],build:{assetsInlineLimit:1000000},server:{fs:{allow:['..']}}});
