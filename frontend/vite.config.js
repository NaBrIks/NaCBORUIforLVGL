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
 configureServer(server){server.middlewares.use(async(req,res,next)=>{const path=(req.url??'').split('?')[0];if(!path.startsWith('/reference/'))return next();const file=referenceFiles[path.slice('/reference/'.length)];if(!file){res.statusCode=404;res.end('Reference not found');return;}try{const source=await readFile(new URL('../docs/'+file,import.meta.url));res.setHeader('Content-Type',file.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8');res.end(source);}catch(error){next(error);}});},
 async generateBundle(){for(const [fileName,file] of Object.entries(referenceFiles))this.emitFile({type:'asset',fileName:'reference/'+fileName,source:await readFile(new URL('../docs/'+file,import.meta.url))});}
};}
export default defineConfig({plugins:[vue(),references()],build:{assetsInlineLimit:1000000},server:{fs:{allow:['..']}}});
