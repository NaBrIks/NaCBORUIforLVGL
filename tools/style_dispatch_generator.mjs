// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Native tables contain only correctly typed function pointers, indexed within
// each signature. The compiler owns method metadata and semantic validation.
export function generateStyleDispatch(contract) {
  let source = '// Generated from contracts/style-api-v2.json. Do not edit.\n';
  const cases = [];
  for (const signature of contract.signatures) {
    const methods = contract.methods.filter(m => m.signature === signature.id);
    if (!methods.length) continue;
    const first = Math.min(...methods.map(m => m.index));
    const last = Math.max(...methods.map(m => m.index));
    if (first !== 0 || last + 1 !== methods.length) throw Error('Non-dense signature table');
    const entries = Array.from({length: last - first + 1}, (_, offset) => {
      const method = methods.find(m => m.index === first + offset && !m.retired);
      return method?.name ?? 'nullptr';
    });
    source += `using StyleSignature${signature.id} = void (*)(lv_style_t *, ${signature.parameters.join(', ')});\n`;
    source += `static const StyleSignature${signature.id} style_methods_${signature.id}[] = {\n  ${entries.join(',\n  ')}\n};\n`;
    cases.push(`  case ${signature.id}: return invoke(style_methods_${signature.id}, index, target, value, context);`);
  }
  source += `static bool execute_style(unsigned signature, unsigned index, lv_style_t *target,\n                          CborValue &value, StyleDecodeContext &context) {\n  switch (signature) {\n${cases.join('\n')}\n  default: return false;\n  }\n}\n`;
  return source;
}
