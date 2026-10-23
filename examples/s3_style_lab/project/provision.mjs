import {contract} from '../../../packages/style-codec/index.js';
import {screenContract} from '../../../packages/screen-codec/index.js';
import {appendShell} from './shell.mjs';
// Explicit PC-side recompilation of authoring JSON after an append-only contract
// extension. Preserve every original identity, screen, style and manifest field;
// only the two compiler fingerprints are updated for the new wire encoding.
export function prepareProvisioningProject(project,{shell=false,shellOptions={}}={}){
 let result=structuredClone(project);
 if(shell)result=appendShell(result,shellOptions);
 result.manifest.requirements={screenABI:screenContract.sha256,styleABI:contract.sha256};
 return result;
}
