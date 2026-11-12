// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {contract} from '../../../packages/style-codec/index.js';
import {screenContract} from '../../../packages/screen-codec/index.js';
import {appendShell,demoShellOptions,withSystemBindings} from './shell.mjs';
import {withAppearanceSetup} from './appearance-setup.mjs';
import {withDisplaySetup} from './display-setup.mjs';

export function provisioningCapabilities(capabilities){
 const binding=withSystemBindings(capabilities.binding);
 const text=maxBytes=>({type:'text',maxBytes});
 const buffers={type:'integer',min:1,max:2};
 const boolean={type:'bool'};
 binding.sources.push(
  {name:'ui.scheme',schema:{type:'object',fields:{id:text(12),title:text(256)}}},
  {name:'ui.display_config',schema:{type:'object',fields:{
   active:text(64),draft:text(64),mode:text(6),buffers,transfer:text(6),changed:boolean,rebooting:boolean
  }}}
 );
 binding.actions=[
  ...binding.actions,
  {name:'ui.select_scheme',schema:text(12)},
  {name:'ui.display_mode',schema:text(6)},
  {name:'ui.display_buffers',schema:buffers},
  {name:'ui.display_transfer',schema:text(6)},
  {name:'ui.display_restart',schema:{type:'null'}}
 ];
 return {...capabilities,binding};
}

export function prepareStockProject(project){
 const shell=prepareProvisioningProject(project,{shell:true,shellOptions:demoShellOptions});
 return withDisplaySetup(withAppearanceSetup(shell));
}

// Explicit PC-side recompilation of authoring JSON after an append-only contract
// extension. Preserve every original identity, screen, style and manifest field;
// only the two compiler fingerprints are updated for the new wire encoding.
export function prepareProvisioningProject(project,{shell=false,shellOptions={}}={}){
 let result=structuredClone(project);
 if(shell)result=appendShell(result,shellOptions);
 result.manifest.requirements={screenABI:screenContract.sha256,styleABI:contract.sha256};
 return result;
}
