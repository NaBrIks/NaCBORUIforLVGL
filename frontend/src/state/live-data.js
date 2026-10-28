import {ref,onBeforeUnmount} from 'vue';
import {DataClient} from '@lvgl-cbor/project-codec';
import {bindingLimits,validateDataValue} from '@lvgl-cbor/screen-codec';

// Runtime snapshots are deliberately separate from project/authoring state.
// There is one bootstrap read per socket connection; further values arrive on WS.
export function createLiveData({capabilities,read,changed=()=>{}}){
 let sources=[],generation=0,online=false,disposed=false;
 const versions=new Map();
 const catalog=()=>capabilities()?.binding?.sources??[];
 const publish=next=>{sources=next;changed(sources);};
 function plain(value,depth=0){
  if(depth>16)throw Error('Data value depth');
  if(value instanceof Map){const result={};for(const [key,item] of value){if(typeof key!=='string')throw Error('Data object key');Object.defineProperty(result,key,{value:plain(item,depth+1),enumerable:true,writable:true,configurable:true});}return result;}
  if(Array.isArray(value))return value.map(item=>plain(item,depth+1));
  return value;
 }
 function source(record){
  const entry=plain(record),definition=catalog().find(item=>item.name===entry?.name);
  if(!definition||!['known','stale','unknown'].includes(entry.state))throw Error('Data source/state');
  if(entry.state==='known')validateDataValue(entry.value,definition.schema,{limits:bindingLimits(capabilities())});
  return {name:entry.name,state:entry.state,...(entry.state==='known'?{value:entry.value}:{})};
 }
 function reset(){online=false;generation++;versions.clear();publish([]);}
 function socketState(state){
  if(disposed)return;
  if(state==='online'){online=true;void bootstrap();return;}
  online=false;generation++;versions.clear();publish(sources.map(item=>({name:item.name,state:'stale'})));
 }
 async function bootstrap(){
  const current=++generation,start=new Map(versions);
  try{
   const snapshot=await read();
   if(disposed||!online||current!==generation)return;
   if(!Array.isArray(snapshot.sources)||snapshot.sources.length>bindingLimits(capabilities()).sources)throw Error('Data source limit');
   const latest=new Map(sources.map(item=>[item.name,item]));
   for(const record of snapshot.sources){const item=source(record);if((versions.get(item.name)??0)===(start.get(item.name)??0))latest.set(item.name,item);}
   publish([...latest.values()]);
  }catch{/* A later event may still supply current values. Never invent a reading. */}
 }
 function event(frame){
  if(disposed||!online||!(frame instanceof Map)||frame.get('v')!==1||frame.get('event')!=='data_changed')return false;
  try{
   const item=source({name:frame.get('source'),state:frame.get('state')??'known',value:plain(frame.get('value'))});
   versions.set(item.name,(versions.get(item.name)??0)+1);
   publish([...sources.filter(value=>value.name!==item.name),item]);return true;
  }catch{return false;}
 }
 function dispose(){disposed=true;online=false;reset();}
 return {event,socketState,reset,dispose,get sources(){return sources;}};
}

export function useLiveData(connection){
 const sources=ref([]),client=new DataClient(connection.origin);
 const live=createLiveData({capabilities:()=>connection.capabilities.value,read:()=>client.read(),changed:value=>sources.value=value});
 const stop=connection.onReset(live.reset);
 onBeforeUnmount(()=>{stop();live.dispose();});
 return {sources,event:live.event,socketState:live.socketState};
}
