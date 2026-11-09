// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
export async function showProjectHome(client){
 const info=await client.info(),entry=info?.project?.entry;
 if(typeof entry!=='string'||!entry)throw Error('Project entry page is unavailable');
 await client.show(entry);return entry;
}
export async function restoreProjectBase(client,revision){
 if(typeof revision!=='string'||!revision)throw Error('Project revision is required');
 await client.reset({revision});return showProjectHome(client);
}
