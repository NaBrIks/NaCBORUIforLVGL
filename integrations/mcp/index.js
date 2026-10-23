// Entirely optional host integration: no import from the editor or firmware.
if(process.env.LVGL_CBOR_MCP_ENABLED!=='0'){
 const {serveStdio}=await import('@modelcontextprotocol/server/stdio');
 const {createServer}=await import('./server.js');
 await serveStdio(()=>createServer({device:process.env.LVGL_CBOR_DEVICE,allowPreview:process.env.LVGL_CBOR_ALLOW_PREVIEW==='1'||process.env.LVGL_CBOR_ALLOW_APPLY==='1',allowSave:process.env.LVGL_CBOR_ALLOW_SAVE==='1',allowData:process.env.LVGL_CBOR_ALLOW_DATA==='1',css:process.env.LVGL_CBOR_MCP_CSS!=='0'}));
}
