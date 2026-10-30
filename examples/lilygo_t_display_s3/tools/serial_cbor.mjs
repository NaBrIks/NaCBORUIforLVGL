// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {encode} from 'cborg';

// A transport adapter only: the MCU's DataRegistry/ProjectService execute requests.
export function connectSerial({port,python='python'}) {
  const child=spawn(python,[fileURLToPath(new URL('./serial_cbor_bridge.py',import.meta.url)),port],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let next=0,stderr='';const pending=new Map(),diagnostics=[];
  child.stderr.on('data',part=>stderr+=part);
  const closed=new Promise(resolve=>child.once('close',resolve));
  const fail=error=>{for(const item of pending.values()){clearTimeout(item.timer);item.no(error);}pending.clear();};
  child.once('error',fail);child.once('close',code=>fail(Error('Serial bridge closed '+code+': '+stderr)));
  createInterface({input:child.stdout}).on('line',line=>{
    let value;try{value=JSON.parse(line);}catch{return;}
    if(value.serial||value.event){diagnostics.push(value);if(diagnostics.length>16)diagnostics.shift();}
    const item=pending.get(value.id);if(!item)return;
    if(!value.ok)value.serialTail=[...diagnostics];
    clearTimeout(item.timer);pending.delete(value.id);item.yes(value);
  });
  return {
    command(request) {
      if(pending.size>=32)throw Error('Serial command queue full (32)');
      const id=++next,packet=encode({...request,id});if(packet.length>4096)throw Error('MCU command limit');
      const frame=Buffer.alloc(packet.length+4);frame.writeUInt32LE(packet.length);frame.set(packet,4);
      return new Promise((yes,no)=>{
        const timer=setTimeout(()=>{pending.delete(id);no(Error('Serial bridge timeout: '+stderr));},12000);
        pending.set(id,{yes,no,timer});child.stdin.write(JSON.stringify({id,frame:frame.toString('hex')})+'\n');
      });
    },
    async close(){child.stdin.end();let timer;await Promise.race([closed,new Promise(resolve=>timer=setTimeout(()=>{child.kill();resolve();},1500))]);clearTimeout(timer);}
  };
}
