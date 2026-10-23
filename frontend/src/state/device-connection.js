import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {screenContract,widgetCatalog} from '@lvgl-cbor/screen-codec';

export function useDeviceConnection({device,simulator=null,local=false,enabled=true,fetcher=globalThis.fetch,pollInterval=5000}){
 const info=ref(null),capabilities=ref(null),httpOnline=ref(false),httpError=ref(''),capabilitiesError=ref(''),epoch=ref(0);
 const resets=new Set();let disposed=false,desired=enabled&&!!device.value.trim(),inflight=null,timer;
 const origin=()=>{const url=new URL(device.value.trim()||globalThis.location?.origin);if(!['http:','https:'].includes(url.protocol))throw Error('HTTP URL required');return url.origin;};
 const sameContract=computed(()=>capabilities.value?.style?.sha256===contract.sha256);
 const screenCompatible=computed(()=>sameContract.value&&capabilities.value?.screen?.sha256===screenContract.sha256);
 const ready=computed(()=>httpOnline.value&&sameContract.value);
 function reset(){epoch.value++;info.value=null;capabilities.value=null;httpOnline.value=false;httpError.value='';capabilitiesError.value='';inflight=null;for(const fn of resets)fn();}
 const onReset=fn=>{resets.add(fn);return ()=>resets.delete(fn);};
 watch(device,reset,{flush:'sync'});
 async function refresh(){
  if(disposed||!enabled||!desired||(!device.value.trim()&&local))return false;
  if(inflight)return inflight;
  let generation=epoch.value;
  const current=()=>!disposed&&generation===epoch.value;
  const json=async url=>{const response=await fetcher(url,{signal:AbortSignal.timeout(4000),cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status+' '+new URL(url).pathname);return response.json();};
  let infoLoaded=false;
  const task=(async()=>{
   try{
    const base=origin(),next=simulator?simulator.info():await json(base+'/api/info');if(!current())return false;
    if(next.source!==(simulator?'simulator':'device'))throw Error('Expected device data');
    const old=info.value,restarted=old&&((old.boot_id&&next.boot_id&&old.boot_id!==next.boot_id)||next.uptime_ms+2000<old.uptime_ms);
    if(restarted){epoch.value++;generation=epoch.value;for(const fn of resets)fn();capabilities.value=null;}
    info.value=next;httpOnline.value=true;infoLoaded=true;
    const caps=simulator?simulator.capabilities():await json(base+'/api/capabilities');if(!current())return false;
    if(caps.format!=='lvgl-cbor-capabilities-1'||!caps.limits||!Array.isArray(caps.resources)||!Array.isArray(caps.availableWidgets)||!Array.isArray(caps.layouts))throw Error('Invalid device capabilities');
    if(caps.style?.sha256!==next.contract_sha256||caps.screen?.sha256!==next.screen_contract_sha256)throw Error('INFO/capabilities mismatch');
    widgetCatalog(caps);
    info.value={...next,resources:caps.resources};capabilities.value=caps;httpOnline.value=true;httpError.value='';capabilitiesError.value='';
    return true;
   }catch(error){if(current()){httpOnline.value=infoLoaded;httpError.value=infoLoaded?'':error.message;capabilitiesError.value=infoLoaded?error.message:'';capabilities.value=null;}return false;}
  })();
  inflight=task;try{return await task;}finally{if(inflight===task)inflight=null;}
 }
 async function connect(){desired=true;reset();if(!simulator&&local)try{localStorage.setItem('lvgl-cbor-device',device.value);}catch{}return refresh();}
 function dispose(){disposed=true;clearInterval(timer);reset();resets.clear();}
 onMounted(()=>{if(enabled){timer=setInterval(refresh,pollInterval);void refresh();}});
 onBeforeUnmount(dispose);
 return {device,info,capabilities,httpOnline,httpError,capabilitiesError,epoch,sameContract,screenCompatible,ready,origin,refresh,connect,onReset,dispose};
}
