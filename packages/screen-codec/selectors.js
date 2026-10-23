import {screenContract} from './contract.js';
import {integerRange} from '@lvgl-cbor/style-codec/values';
export function encodeSelector(rule){
 let part=rule.part??'MAIN';if(typeof part!=='string')throw Error('Style part');part=part.replace(/^LV_PART_/,'');
 if(!Object.hasOwn(screenContract.parts,part))throw Error('Unknown part '+part);
 if(rule.state!==undefined&&!Array.isArray(rule.state))throw Error('Style state array');
 let value=screenContract.parts[part];
 for(let state of rule.state??[]){if(typeof state!=='string')throw Error('Style state');state=state.replace(/^LV_STATE_/,'');if(state==='DEFAULT')continue;if(!Object.hasOwn(screenContract.states,state))throw Error('Unknown state '+state);value|=screenContract.states[state];}
 return value;
}
export function decodeSelector(value){
 if(!integerRange(value,0,0x6ffff))throw Error('Style selector');
 const part=Object.entries(screenContract.parts).find(([,v])=>v===(value&0xff0000))?.[0];
 let rest=value&0xffff;const state=[];
 for(const [name,bit] of Object.entries(screenContract.states))if(rest&bit){state.push(name);rest&=~bit;}
 if(!part||rest)throw Error('Style selector');return {part,state};
}
export function normalizeSelector(rule){return decodeSelector(encodeSelector(rule));}
