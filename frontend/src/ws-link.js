// Browser-independent retry lifecycle; no style or application protocol assumptions.
export class ReconnectingSocket {
 constructor({makeSocket=url=>new WebSocket(url),onState=()=>{},onMessage=()=>{},onError=()=>{},later=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
  Object.assign(this,{makeSocket,onState,onMessage,onError,later,cancel});this.active=false;this.socket=null;this.retry=null;this.deadline=null;this.attempt=0;
 }
 start(url){this.stop();this.url=url;this.active=true;this.attempt=0;this.open();}
 stop(){this.active=false;this.cancel(this.retry);this.cancel(this.deadline);this.retry=null;this.deadline=null;const socket=this.socket;this.socket=null;if(socket){socket.onopen=socket.onclose=socket.onmessage=socket.onerror=null;socket.close();}this.onState('stopped');}
 schedule(){if(!this.active||this.retry!==null)return;this.onState('retry');const delay=Math.min(10000,1000*2**Math.min(this.attempt++,4));this.retry=this.later(()=>{this.retry=null;this.open();},delay);}
 open(){
  if(!this.active)return;this.onState('connecting');let socket;
  try{socket=this.makeSocket(this.url);}catch(error){this.onError(error.message);this.schedule();return;}
  this.socket=socket;socket.binaryType='arraybuffer';
  const current=()=>this.active&&this.socket===socket;
  socket.onopen=()=>{if(!current())return;this.cancel(this.deadline);this.deadline=null;this.attempt=0;this.onState('online');};
  socket.onmessage=event=>{if(current())this.onMessage(event);};
  socket.onerror=()=>{if(current())this.onError('Ошибка WS; соединение будет восстановлено');};
  socket.onclose=event=>{if(!current())return;this.cancel(this.deadline);this.deadline=null;this.socket=null;this.onError('WS закрыт ('+event.code+'); переподключение');this.schedule();};
  this.deadline=this.later(()=>{if(!current()||socket.readyState===1)return;this.socket=null;socket.onclose=null;socket.close();this.deadline=null;this.onError('Тайм-аут подключения WS');this.schedule();},5000);
 }
 send(bytes){if(!this.socket||this.socket.readyState!==1)return false;try{this.socket.send(bytes);return true;}catch(error){this.onError(error.message);this.socket.close();return false;}}
}
