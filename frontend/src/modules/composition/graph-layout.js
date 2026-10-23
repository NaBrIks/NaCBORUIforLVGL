// Positions are derived from the declared graph; no second graph is persisted.
export function layoutCompositionGraph(graph){
 const levels=new Map(),ids=new Set(graph.nodes.map(node=>node.id)),children=new Map();
 for(const edge of graph.edges)if(ids.has(edge.from)&&ids.has(edge.to)){if(!children.has(edge.from))children.set(edge.from,[]);children.get(edge.from).push(edge.to);}
 const entry=graph.nodes.find(node=>node.entry),roots=[...(entry?[entry]:[]),...graph.nodes];
 for(const root of roots){
  if(levels.has(root.id))continue;
  levels.set(root.id,levels.size?Math.max(...levels.values())+1:0);const queue=[root.id];
  for(let index=0;index<queue.length;index++)for(const child of children.get(queue[index])??[])if(!levels.has(child)){levels.set(child,levels.get(queue[index])+1);queue.push(child);}
 }
 const rows=[];for(const [id,level] of levels){rows[level]??=[];rows[level].push(id);}
 const cellWidth=240,rowHeight=70,width=Math.max(720,...rows.map(row=>row.length*cellWidth)),positions=new Map();
 rows.forEach((row,level)=>row.forEach((id,index)=>positions.set(id,{level,x:(width-row.length*cellWidth)/2+index*cellWidth+15,y:level*rowHeight+16})));
 return {width,height:Math.max(rowHeight,rows.length*rowHeight),nodes:graph.nodes.map(node=>({...node,...positions.get(node.id)}))};
}
