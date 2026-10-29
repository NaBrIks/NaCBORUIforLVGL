import {readFile,stat} from 'node:fs/promises';
import {parseDocument,maxDocumentBytes} from '../../packages/document-io/index.js';
import {encodeProject} from '../../packages/project-codec/index.js';

// This is the same authoring compiler used by the editor/MCP, not a JSON renderer.
export async function loadProject(path,capabilities,{entry}={}) {
  const info=await stat(path);
  if(!info.isFile()||info.size<1||info.size>maxDocumentBytes)throw Error('Project file size: 1 byte to 2 MiB');
  const project=parseDocument('project',new Uint8Array(await readFile(path)),{capabilities});
  entry??=project.manifest.entry;
  if(!Object.hasOwn(project.screens,entry))throw Error('Unknown entry screen '+entry);
  const {width,height}=project.screens[entry].size??{width:800,height:480};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>4096||height>4096||width*height>8*1024*1024)throw Error('Player display dimensions out of range');
  return {project,entry,width,height,bytes:encodeProject(project,capabilities)};
}
