// Browser-only transport fixture. It validates CBOR, but does not execute LVGL.
import {encode} from 'cborg';
import {offlineCapabilities,screenContract} from '@lvgl-cbor/screen-codec';
import {contract,decodePacket,decodeStyle} from '@lvgl-cbor/style-codec';
export function createSimulator(){
 const started=Date.now();let received=0,applied=0;
 return {
  capabilities:()=>({...offlineCapabilities(),source:'simulator',resources:['default','montserrat_20','montserrat_28'].map(name=>({name,type:'const lv_font_t *'}))}),
  info:()=>({screen_contract_sha256:screenContract.sha256,source:'simulator',board:'Эмулятор сайта · тестовые данные',ip:'127.0.0.1',idf:'—',lvgl:'9.6.0 (контракт)',boot_id:'browser',uptime_ms:Date.now()-started,contract_sha256:contract.sha256,received,applied,resources:['default','montserrat_20','montserrat_28'].map(name=>({name,type:'const lv_font_t *'})),tasks:[{name:'demo-idle',id:1,core:0,priority:0,state:'demo',stack_free:4096},{name:'demo-style-worker',id:2,core:1,priority:5,state:'demo',stack_free:8192}]}),
  socket(){
   const socket={readyState:0,close(){this.readyState=3;},send(bytes){
    if(this.readyState!==1)throw Error('Simulator disconnected');
    received++;const packet=decodePacket(bytes);let ok=true,error='';
    try{decodeStyle(bytes);applied++;}catch(e){ok=false;error=e.message;}
    const data=encode(new Map([['v',1],['id',packet.get('id')],['ok',ok],['applied',false],['error',error],['source','simulator'],['note','Проверка CBOR; LVGL и LCD не исполняются'],['echo',ok?new Uint8Array(bytes):new Uint8Array()]]));
    setTimeout(()=>{if(this.readyState===1)this.onmessage?.({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});},25);
   }};
   setTimeout(()=>{if(socket.readyState===0){socket.readyState=1;socket.onopen?.();}},0);return socket;
  }
 };
}
