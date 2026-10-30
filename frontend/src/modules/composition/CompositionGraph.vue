<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed} from 'vue';
import {projectCompositionGraph,validateProjectComposition} from '../../../../packages/project-codec/index.js';
import {layoutCompositionGraph} from './graph-layout.js';
import './composition.css';
const props=defineProps({project:Object}),graph=computed(()=>projectCompositionGraph(props.project));
const error=computed(()=>{try{validateProjectComposition(props.project);return '';}catch(value){return value.message;}});
const layout=computed(()=>layoutCompositionGraph(graph.value)),width=computed(()=>layout.value.width),nodes=computed(()=>layout.value.nodes);
const edges=computed(()=>graph.value.edges.map(edge=>({...edge,source:nodes.value.find(node=>node.id===edge.from),target:nodes.value.find(node=>node.id===edge.to)})).filter(edge=>edge.source&&edge.target));
const height=computed(()=>layout.value.height);
function line(edge){const x=edge.source.x+105,y=edge.source.y+30,tx=edge.target.x+105,ty=edge.target.y;return `M${x},${y} C${x},${y+25} ${tx},${ty-25} ${tx},${ty}`;}
</script>
<template><section v-if="graph.edges.length" class="panel composition-graph" aria-label="Граф вложенных страниц"><div class="panel-head"><h2>Связи страниц</h2><span class="muted">Сплошная линия — начальная страница</span></div><p v-if="error" class="bad view-note" role="alert">{{error}}</p><div class="composition-graph-scroll"><svg role="img" aria-label="Граф допустимых вложенных страниц проекта" :viewBox="`0 0 ${width} ${height}`" :style="{height:height+'px',minWidth:width+'px'}"><defs><marker id="composition-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8"/></marker></defs><path v-for="(edge,index) in edges" :key="index" :d="line(edge)" class="composition-edge" :class="{'composition-initial':edge.initial}" marker-end="url(#composition-arrow)"><title>{{edge.from}} / {{edge.view}} → {{edge.to}} · {{edge.retention}}</title></path><g v-for="node in nodes" :key="node.id" :transform="`translate(${node.x},${node.y})`"><title>{{node.name}} · {{node.id}}</title><rect width="210" height="30" :class="{'composition-entry':node.entry}"/><text x="6" y="19">{{node.name.length>28?node.name.slice(0,27)+'…':node.name}}</text></g></svg></div></section></template>
