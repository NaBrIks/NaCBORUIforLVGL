import {computed,inject} from 'vue';
import {contract} from '@lvgl-cbor/style-codec';
import {screenContract,widgetCatalog} from '@lvgl-cbor/screen-codec';
export function useRuntimeCapabilities(){
 const live=inject('lvgl-capabilities',null);
 const capabilities=inject('lvgl-authoring-capabilities',live);
 const catalog=computed(()=>capabilities?.value?.style??contract);
 const families=computed(()=>widgetCatalog(capabilities?.value).filter(w=>!w.retired&&(!capabilities?.value||capabilities.value.availableWidgets.includes(w.id))));
 const widgets=computed(()=>families.value.map(w=>w.name));
 const standardWidgets=computed(()=>families.value.filter(w=>!w.abi).map(w=>w.name));
 const layouts=computed(()=>capabilities?.value?.layouts??[0,1,2]);
 return {capabilities,catalog,widgets,families,standardWidgets,layouts};
}
