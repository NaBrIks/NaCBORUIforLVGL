#pragma once
// SPDX-License-Identifier: MIT
#include <cstddef>
#include <cstdint>

namespace native_view
{
 inline constexpr size_t packet_header_bytes=32;
 inline constexpr size_t packet_payload_limit=4096;
 inline constexpr uint16_t rgb565_le=1;
 inline constexpr uint16_t last_packet=1;
 inline constexpr uint16_t rle_packet=2;

 struct Packet
 {
  uint32_t bytes{}, revision{}, scene{};
  uint16_t x{}, y{}, width{}, height{}, canvas_width{}, canvas_height{}, format{}, flags{};
 };

 inline void write_le(uint8_t *out,uint32_t value,unsigned count)
 {
  for(unsigned i=0;i<count;++i) out[i]=static_cast<uint8_t>(value>>(8*i));
 }

 inline void write_packet(uint8_t *out,const Packet &packet,bool version2=false)
 {
  out[0]='L'; out[1]='V'; out[2]='F'; out[3]=version2?'2':'1';
  write_le(out+4,packet.bytes,4);
  write_le(out+8,packet.revision,4);
  write_le(out+12,packet.scene,4);
  const uint16_t fields[]{packet.x,packet.y,packet.width,packet.height,
      packet.canvas_width,packet.canvas_height,packet.format,packet.flags};
  for(size_t i=0;i<8;++i) write_le(out+16+i*2,fields[i],2);
 }
}
