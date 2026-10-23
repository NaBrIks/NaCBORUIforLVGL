#pragma once
#include <cstddef>
namespace lvgl_cbor {inline constexpr const char *screen_contract_sha256="88b890b59be1a2bc499022a2e23870779778bf58dff3430f0ef8f091ae9c557a";inline constexpr unsigned screen_contract_version=3;
inline constexpr unsigned screen_command_create=0;
inline constexpr unsigned screen_command_set_id=1;
inline constexpr unsigned screen_command_style=2;
inline constexpr unsigned screen_command_style_ref=3;
inline constexpr size_t screen_widget_count=12;
inline constexpr size_t screen_packet_bytes=32768, screen_max_nodes=128, screen_max_depth=12, screen_max_styles=256, screen_text_bytes=16384;
inline constexpr size_t widget_text_bytes=4096, line_min_points=2, line_max_points=256, screen_style_uses=32;
inline constexpr int line_point_min=-32768, line_point_max=32767;
}
