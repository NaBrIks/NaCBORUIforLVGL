#pragma once
#include <cstddef>
namespace lvgl_cbor::binding_contract {
inline constexpr unsigned version=1;
inline constexpr const char *sha256="0e9c011dcd161a9207157162174e3765d374e5279322289fa1ce1fe57aa34871";
inline constexpr size_t expressionDepth=8;
inline constexpr size_t expressionNodes=64;
inline constexpr size_t pathDepth=8;
inline constexpr size_t bindings=128;
inline constexpr size_t events=128;
inline constexpr size_t objectFields=16;
inline constexpr size_t schemaDepth=4;
inline constexpr size_t arrayItems=256;
inline constexpr size_t textBytes=4096;
inline constexpr size_t valueBytes=16384;
inline constexpr size_t valueDepth=16;
inline constexpr size_t sources=32;
inline constexpr size_t actions=32;
inline constexpr size_t snapshotBytes=65536;
inline constexpr size_t eventQueue=32;
inline constexpr size_t eventQueueBytes=32768;
struct Operator { const char *name; unsigned min_args, max_args; };
inline constexpr Operator operators[]={{"eq",2,2},{"ne",2,2},{"lt",2,2},{"le",2,2},{"gt",2,2},{"ge",2,2},{"and",2,16},{"or",2,16},{"not",1,1},{"select",3,3},{"add",2,2},{"sub",2,2},{"mul",2,2},{"div",2,2},{"round",1,1}};
inline constexpr const char *event_names[]={"clicked","value_changed","ready","long_pressed"};
}
