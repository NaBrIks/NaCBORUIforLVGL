// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {randomUUID} from 'node:crypto';
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
export function createAssistantChat(){
 let id=randomUUID(),history=[],entries=[],offset=null,lastFrame=null;
 return {
  hasImages:()=>history.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')),
  begin(system,content,prompt,attachments=[]){if(bytes([...history,{role:'user',content}])>896*1024)throw Error('Контекст чата заполнен. Сохраните результат и начните Новый чат; предыдущая история не удалена.');offset=null;entries.push({id:entries.length+1,role:'user',text:prompt,attachments:attachments.map(a=>({name:a.name||'attachment',mime:a.mime}))});return [{role:'system',content:system},...history,{role:'user',content}];},
  answer(messages,text){messages.push({role:'assistant',content:text});entries.push({id:entries.length+1,role:'assistant',text,attachments:[]});},
  remember(messages){
   const fixed=[];let pending=new Set();const flush=()=>{for(const id of pending)fixed.push({role:'tool',tool_call_id:id,content:JSON.stringify({isError:true,error:'interrupted_unconfirmed',hint:'The operation may have executed. Inspect actual state before any retry.'})});pending.clear();};
   for(const message of messages.slice(1)){if(message.role==='system')continue;if(message.role==='assistant'||message.role==='user')flush();fixed.push(message);if(message.tool_calls)pending=new Set(message.tool_calls.map(c=>c.id));if(message.role==='tool')pending.delete(message.tool_call_id);}flush();history=fixed;
  },
  fail(error){if(entries.at(-1)?.role==='user'){entries.push({id:entries.length+1,role:'error',text:error,attachments:[]});history.push({role:'assistant',content:'The previous operation failed or was interrupted: '+error+'. Inspect actual application state before continuing.'});}},
  frame(){return lastFrame;},setFrame(value){lastFrame=value;},
  page(requested){offset=requested;},
  public(safe){
   const item=e=>({id:e.id,role:e.role,text:safe(e.text),files:e.attachments.map(a=>safe(a.name)).join(' · ')});let start=offset===null?entries.length:Math.min(offset,Math.max(0,entries.length-1)),selected=[];
   if(offset===null){while(start>0&&selected.length<8){const next=item(entries[start-1]);if(selected.length&&bytes([next,...selected])>6000)break;selected.unshift(next);start--;}}
   else for(let i=start;i<entries.length&&selected.length<8;i++){const next=item(entries[i]);if(selected.length&&bytes([...selected,next])>6000)break;selected.push(next);}
   return {id,total:entries.length,offset:start,nextOffset:start+selected.length<entries.length?start+selected.length:-1,messages:selected};
  },
  reset(){id=randomUUID();history=[];entries=[];offset=null;lastFrame=null;}
 };
}
