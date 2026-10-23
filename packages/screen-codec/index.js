import {encodeScreen} from './encode.js';
import {decodeScreen} from './decode.js';
export {encodeScreen,decodeScreen};
export {screenContract} from './contract.js';
export {decodeScreenPacket} from './wire.js';
export {offlineCapabilities,checkScreenCapabilities} from './capabilities.js';
export {encodeMethods as encodeScreenStyles} from '@lvgl-cbor/style-codec';
export {widgetCatalog} from './widget-catalog.js';
export {methodSchema,defaultParameter,parameterType,convertParameter} from './parameter-schema.js';
export {encodeWidgetMethod} from './widget-methods.js';
export {normalizeSelector} from './selectors.js';
export {bindingContract} from './binding-contract.js';
export {compositionContract} from './composition-contract.js';
export {compositionAvailable,compositionLimits,screenViews,validateView,validateNavigation} from './composition.js';
export {bindingText,validateDataSchema,validateDataValue,validateDataPath,dataSchemaAtPath,dataDescriptor,defaultDataValue,validateBindingCapabilities,bindingCatalogIsAuthoritative,dataPathLabel,bindingLimits} from './binding-schema.js';
export {UNKNOWN,validateExpression,inspectExpression,expressionDependencies,inferExpressionSchema,evaluateExpression,schemasCompatible,literalSchema} from './binding-expression.js';
export {bindingMethodCatalog,methodDataSchema,eventValueSchema,formatBindingValue,validateBindingFormat} from './bindings.js';
// Defaults, aliases and enum spelling have one canonical representation. Button.text is restored
// using its compact caption hint, so authoring structure and visible content survive both ways.
export const normalizeScreen=(document,capabilities)=>decodeScreen(encodeScreen(document,'normalize',capabilities),capabilities);
export function validateScreen(document,capabilities){try{encodeScreen(document,'validate',capabilities);return [];}catch(error){return [error.message];}}
