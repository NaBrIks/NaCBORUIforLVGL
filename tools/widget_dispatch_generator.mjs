const cppType = type => ({text:'const char *',resource:'const void *',points:'PointSpan'})[type] ?? type;
export function generateWidgetDispatch(contract) {
  let out = '// Generated from contracts/screen-api-v3.json. Local switch dispatch; no method tables.\n';
  for (const family of [contract.common,...contract.widgets]) {
    const name=family.name??'common';
    if(family.feature)out+=`#if ${family.feature}\n`;
    for(const m of family.methods.filter(m=>m.fixed?.length))
      out+=`static void adapt_${name}_${m.opcode}(lv_obj_t *obj, ${m.parameters.map((p,i)=>`${cppType(p)} a${i}`).join(', ')}) { ${m.c}(obj, ${[...m.parameters.map((_,i)=>`a${i}`),...m.fixed].join(', ')}); }\n`;
    out+=`static bool execute_${name}(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {\n  switch (method) {\n`;
    for(const m of family.methods.filter(m=>!m.retired))
      out+=`  case ${m.opcode}: return invoke_widget(${m.fixed?.length?`adapt_${name}_${m.opcode}`:m.c}, obj, cursor, context);\n`;
    out+='  default: return false;\n  }\n}\n';
    if(family.feature)out+='#endif\n';
  }
  // Selected once per creation, not once per method invocation.
  out+='static bool select_builtin(unsigned type, WidgetFactory &create, WidgetExecutor &execute) {\n  switch (type) {\n';
  for(const w of contract.widgets){
    if(w.feature)out+=`#if ${w.feature}\n`;
    out+=`  case ${w.id}: create = ${w.create}; execute = execute_${w.name}; return true;\n`;
    if(w.feature)out+='#endif\n';
  }
  out+='  default: return false;\n  }\n}\n';
  out+='static unsigned builtin_type(const char *name) {\n';
  for(const w of contract.widgets)out+=`  if (!std::strcmp(name, "${w.name}")) return ${w.id};\n`;
  return out+'  return 65536;\n}\n';
}
