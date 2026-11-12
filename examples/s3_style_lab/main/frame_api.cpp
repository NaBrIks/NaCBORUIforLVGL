// SPDX-License-Identifier: MIT
#include "frame_api.hpp"
#include "board.hpp"
#include "frame_packets.hpp"
#include "esp_log.h"
#include "esp_timer.h"
#include <cstdio>
#include "lvgl.h"
#include "lvgl_cbor/data_registry.hpp"
#include <NaWServer/request.h>
#include <NaWServer/response.h>
#include <algorithm>
#include <cstring>
#include <charconv>
#include <new>
namespace
{
 void little(uint8_t *p, uint32_t n, unsigned bytes)
 {
  for(unsigned i=0;i<bytes;++i)p[i]=static_cast<uint8_t>(n>>(8*i));
 }
}
bool FrameApi::begin(uint32_t width,uint32_t height)
{
 if(!width || width % 2 || !height || uint64_t(width)*height>512*1024)return false;
 pointer_=std::make_unique<native_view::Pointer>(lv_display_get_default());
 if(!pointer_->ready())pointer_.reset();
 width_=width;
 height_=height;
 socket_.onMessage([this](NaWServer::WebSocketClient *client,const uint8_t *data,size_t size,bool binary)
 {
  if(binary || !size || size>10) return;
  const auto *text=reinterpret_cast<const char *>(data);
  uint32_t since{};
  const auto parsed=std::from_chars(text,text+size,since);
  if(parsed.ec!=std::errc{} || parsed.ptr!=text+size) return;
  std::lock_guard<std::mutex> lock(mutex_);
  auto token=client->outputSession().lock();
  if(socket_client_.lock()!=token)
  {
   if(socket_active_) leased_=false;
   socket_active_=socket_requested_=false;
   socket_client_=token;
  }
  if(socket_requested_ || socket_active_) return;
  socket_since_=since;
  socket_request_ms_=uint32_t(esp_timer_get_time()/1000);
  socket_requested_=true;
 });
 const auto config=display_config();
 if(config.rle && config.rle_buffer)
 {
  rle_buffer_.reset(new(std::nothrow) uint8_t[native_view::packet_payload_limit]);
  if(!rle_buffer_) ESP_LOGW("frame_api","RLE scratch allocation failed; using streaming RLE");
 }
 return true;
}

void FrameApi::set_scene(uint32_t next)
{
 if(scene_.load()==next) return;
 std::lock_guard<std::mutex> lock(mutex_);
 DisplayRegion previous{};
 scene_revision_floor_=display_frame_snapshot(0,previous)?previous.revision:0;
 scene_.store(next);
}

size_t FrameApi::read_stream(size_t offset,uint8_t *out,size_t capacity)
{
 const size_t count=std::min({capacity,bytes_-offset,size_t(4096)});
 if(!count) return 0;
 if(!packets_)
 {
  size_t written=0;
  if(offset<header_.size())
  {
   written=std::min(count,header_.size()-offset);
   std::memcpy(out,header_.data()+offset,written);
  }
  if(written<count &&
     !display_copy_region(region_,offset+written-header_.size(),out+written,count-written)) return 0;
  return count;
 }

 using namespace native_view;
 if(scene_.load()!=leased_scene_) return 0;
 const size_t row_bytes=size_t(region_.width)*2;
 const size_t rows_per_packet=packet_payload_limit/row_bytes;
 const size_t packet_stride=packet_header_bytes+rows_per_packet*row_bytes;
 const size_t first_row=(offset/packet_stride)*rows_per_packet;
 const size_t inside=offset%packet_stride;
 const size_t rows=std::min(rows_per_packet,size_t(region_.height)-first_row);
 const size_t payload=rows*row_bytes;
 const size_t length=std::min(count,packet_header_bytes+payload-inside);
 size_t written=0;
 if(inside<packet_header_bytes)
 {
  uint8_t header[packet_header_bytes];
  write_packet(header,{uint32_t(payload),region_.revision,leased_scene_,
      uint16_t(region_.x),uint16_t(region_.y+first_row),uint16_t(region_.width),uint16_t(rows),
      uint16_t(width_),uint16_t(height_),rgb565_le,
      first_row+rows==region_.height?last_packet:uint16_t(0)});
  written=std::min(length,packet_header_bytes-inside);
  std::memcpy(out,header+inside,written);
 }
 if(written<length &&
    !display_copy_region(region_,first_row*row_bytes+inside+written-packet_header_bytes,
        out+written,length-written)) return 0;
 return scene_.load()==leased_scene_?length:0;
}

FrameApi::Plan FrameApi::prepare_regions(DisplayRegions regions)
{
 DisplayRegion region{};
 region.revision=regions.revision;
 size_t raw_bytes=0;
 bool full=false;
 for(size_t i=0;i<regions.count;++i) raw_bytes+=size_t(regions.items[i].width)*regions.items[i].height*2;
 full=raw_bytes>=size_t(width_)*height_*2;
 if(full)
 {
  regions.count=1;regions.items[0]={0,0,width_,height_,regions.revision};
  raw_bytes=size_t(width_)*height_*2;
 }
 uint32_t right=0,bottom=0;
 region.x=width_;region.y=height_;
 size_t records=0,overhead=0;
 for(size_t i=0;i<regions.count;++i)
 {
  const auto &item=regions.items[i];
  region.x=std::min(region.x,item.x);region.y=std::min(region.y,item.y);
  right=std::max(right,item.x+item.width);bottom=std::max(bottom,item.y+item.height);
  const auto rows=native_view::packet_payload_limit/(2*item.width);
  const auto packets_in_region=(item.height+rows-1)/rows;
  records+=packets_in_region;
  overhead+=packets_in_region*((rows*item.width+127)/128+1);
 }
 region.width=right-region.x;region.height=bottom-region.y;
 regions_=regions;region_index_=region_rows_=0;part_ready_=false;
 bytes_=raw_bytes+records*native_view::packet_header_bytes+overhead;
 return {region,raw_bytes,full};
}

void FrameApi::begin_part()
{
 using namespace native_view;
 const auto &area=regions_.items[region_index_];
 part_={area.x,area.y+uint32_t(region_rows_),area.width,
     uint32_t(std::min<size_t>(area.height-region_rows_,packet_payload_limit/(area.width*2))),regions_.revision};
 const auto pixels=size_t(part_.width)*part_.height;
 part_size_=pixels*2;
 part_offset_=0;
 encoder_={};
 compressed_=rle_;
 if(compressed_ && rle_buffer_)
 {
  struct Encode { FrameApi &api; size_t pixels, written{}; } context{*this,pixels};
  const auto ok=display_with_region(part_,&context,[](void *opaque,const uint16_t *data,size_t stride)
  {
   auto &ctx=*static_cast<Encode *>(opaque);
   ctx.written=ctx.api.encoder_.write(data,stride,ctx.api.part_.width,ctx.pixels,
       ctx.api.rle_buffer_.get(),ctx.api.part_size_-1);
  });
  compressed_=ok && encoder_.done(pixels);
  if(compressed_) part_size_=context.written;
 }
 const bool last=region_index_+1==regions_.count && region_rows_+part_.height==area.height;
 write_packet(part_header_.data(),{compressed_?0u:uint32_t(part_size_),part_.revision,leased_scene_,
     uint16_t(part_.x),uint16_t(part_.y),uint16_t(part_.width),uint16_t(part_.height),
     uint16_t(width_),uint16_t(height_),rgb565_le,uint16_t((last?last_packet:0)|(compressed_?rle_packet:0))},true);
 part_ready_=true;
}

NaWServer::BodyReadResult FrameApi::read_regions(uint8_t *out,size_t capacity,size_t part_budget)
{
 using namespace NaWServer;
 using namespace native_view;
 if(scene_.load()!=leased_scene_) return {BodyReadStatus::TransportError,0};
 size_t written=0;
 // Limit how much framebuffer work one shared HTTP producer step can do.
 for(size_t parts=0;parts<part_budget && written<capacity && region_index_<regions_.count;++parts)
 {
  if(!part_ready_) begin_part();
  if(part_offset_<packet_header_bytes)
  {
   const auto count=std::min(capacity-written,packet_header_bytes-part_offset_);
   std::memcpy(out+written,part_header_.data()+part_offset_,count);
   written+=count;part_offset_+=count;
  }
  if(written==capacity) break;
  bool complete=false;
  if(compressed_ && !rle_buffer_)
  {
   struct Encode {FrameApi &api; uint8_t *out; size_t capacity,pixels,written{};};
   Encode context{*this,out+written,capacity-written,size_t(part_.width)*part_.height};
   if(!display_with_region(part_,&context,[](void *opaque,const uint16_t *data,size_t stride)
   {
    auto &ctx=*static_cast<Encode *>(opaque);
    ctx.written=ctx.api.encoder_.write(data,stride,ctx.api.part_.width,ctx.pixels,ctx.out,ctx.capacity);
   })) return {BodyReadStatus::TransportError,0};
   written+=context.written;
   complete=encoder_.done(context.pixels);
  }
  else
  {
   const auto offset=part_offset_-packet_header_bytes;
   const auto count=std::min(capacity-written,part_size_-offset);
   if(compressed_) std::memcpy(out+written,rle_buffer_.get()+offset,count);
   else if(!display_copy_region(part_,offset,out+written,count)) return {BodyReadStatus::TransportError,0};
   written+=count;part_offset_+=count;
   complete=offset+count==part_size_;
  }
  if(complete)
  {
   region_rows_+=part_.height;
   if(region_rows_==regions_.items[region_index_].height) {++region_index_;region_rows_=0;}
   part_ready_=false;
  }
 }
 if(scene_.load()!=leased_scene_) return {BodyReadStatus::TransportError,0};
 return written ? BodyReadResult{BodyReadStatus::Data,written} : BodyReadResult{BodyReadStatus::End,0};
}

void FrameApi::process()
{
 if(!pointer_) return;
 for(size_t processed=0;processed<16;++processed)
 {
  native_view::Input event{};
  {
   std::lock_guard<std::mutex> lock(mutex_);
   if(!inputs_.pop(event)) break;
  }
  (void)pointer_->input(event.x,event.y,event.pressed);
 }
 pointer_->tick();
}

void FrameApi::process_socket(uint32_t now)
{
 using namespace NaWServer;
 // WS is driven by the LVGL loop. The HTTP producer holds the same frame lease.
 std::lock_guard<std::mutex> lock(mutex_);
 if(!socket_requested_ && !socket_active_) return;
 const auto client=socket_client_.lock();
 const auto reset=[&] {
  if(socket_active_) leased_=false;
  socket_active_=socket_requested_=socket_complete_=false;
  socket_bytes_=0;
 };
 if(!client) {reset();return;}
 const auto send=[&](const uint8_t *bytes,size_t size,bool binary)
 {
  const auto result=client->sendCopy(bytes,size,binary);
  if(result==WebSocketSendResult::Queued) return true;
  if(result!=WebSocketSendResult::Busy && result!=WebSocketSendResult::QueueFull &&
     result!=WebSocketSendResult::GlobalFull) reset();
  return false;
 };
 const auto text=[&](const char *value,size_t size){return send(reinterpret_cast<const uint8_t *>(value),size,false);};
 if(!socket_active_)
 {
  if(leased_) return;
  const auto scene=scene_.load();
  const auto config=display_config();
  DisplayRegions regions;
  const bool force=scene_revision_floor_ && socket_since_<=scene_revision_floor_;
  if(!display_frame_regions(force?0:socket_since_,regions) || regions.revision==scene_revision_floor_ || !regions.count)
  {
   if(uint32_t(now-socket_request_ms_)>=7000 && text("idle",4)) reset();
   return;
  }
  if(config.cyclic && !display_frame_regions(0,regions)) return;
  const auto plan=prepare_regions(regions);
  const auto &e=plan.extent;
  char header[160];
  const auto len=std::snprintf(header,sizeof(header),"begin,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%zu,%u",
      static_cast<unsigned long>(e.revision),static_cast<unsigned long>(scene),static_cast<unsigned long>(e.x),
      static_cast<unsigned long>(e.y),static_cast<unsigned long>(width_),static_cast<unsigned long>(height_),
      static_cast<unsigned long>(e.width),static_cast<unsigned long>(e.height),plan.raw_bytes,unsigned(plan.full));
  if(len<=0 || size_t(len)>=sizeof(header) || !text(header,size_t(len))) return;
  socket_active_=leased_=true;
  socket_complete_=false;
  leased_scene_=scene;
  rle_=config.rle;
  socket_bytes_=0;
 }
 if(scene_.load()!=leased_scene_)
 {
  socket_bytes_=0;
  if(text("cancel",6)) reset();
  return;
 }
 // Retain at most one unsent fragment while the managed TX block is occupied.
 for(unsigned i=0;i<4;++i)
 {
  if(!socket_bytes_ && !socket_complete_)
  {
   const auto block=read_regions(socket_packet_.data(),socket_packet_.size(),16);
   if(block.status==BodyReadStatus::TransportError) return;
   socket_bytes_=block.size;
   socket_complete_=block.status==BodyReadStatus::End;
  }
  if(socket_complete_) {if(text("end",3)) reset();return;}
  if(!send(socket_packet_.data(),socket_bytes_,true)) return;
  socket_bytes_=0;
 }
}

NaWServer::RouteDescriptors FrameApi::routes() const
{
 static const NaWServer::RouteDescriptor route[]{ {"/api/view/frame",NaWServer::HttpMethod::Get}, {"/api/view/input",NaWServer::HttpMethod::Post} };
 return {route,2};
}
void FrameApi::handleRequest(NaWServer::Request *request,NaWServer::Response &response)
{
 using namespace NaWServer;
 (void)response.header("Access-Control-Allow-Origin","*");
 (void)response.header("Access-Control-Expose-Headers","Retry-After, X-Frame-X, X-Frame-Y, X-Frame-Width, X-Frame-Height, X-Frame-Revision, X-Frame-Crop-Height, X-Frame-Scene, X-Frame-Crop-Width, X-Frame-Raw-Bytes, X-Frame-Full");
 (void)response.header("Cache-Control","no-store");
 if(request->method()==HttpMethod::Post)
 {
  const auto body=request->body();lvgl_cbor::DataValue value;std::string decode_error;
  const auto content_type=request->header("Content-Type");
  bool valid=content_type && content_type->compare(0,16,"application/cbor")==0 && body.size()<=128 && lvgl_cbor::decode_data_value(body.data(),body.size(),value,decode_error,128,2);
  auto *object=valid?std::get_if<lvgl_cbor::DataValue::Object>(&value.value):nullptr;
  native_view::Input input{};
  if(object && object->size()==3 && object->count("x") && object->count("y") && object->count("pressed"))
  {
   auto *x=std::get_if<int64_t>(&object->at("x").value);auto *y=std::get_if<int64_t>(&object->at("y").value);
   auto *pressed=std::get_if<bool>(&object->at("pressed").value);
   valid=x && y && pressed && *x>=0 && *y>=0 && *x<width_ && *y<height_;
   if(valid)input={int32_t(*x),int32_t(*y),*pressed};
  } else valid=false;
  int status=400;const char *reply="{\"error\":\"view_input_invalid\"}";
  if(valid && pointer_)
  {
   std::lock_guard<std::mutex> lock(mutex_);
   status=inputs_.push(input.x,input.y,input.pressed)?200:503;
   reply=status==200?"{\"ok\":true}":"{\"error\":\"view_input_busy\"}";
  }
  (void)response.send(status,"application/json",{reinterpret_cast<const uint8_t *>(reply),std::strlen(reply)});return;
 }
 uint32_t since{};
 if(const auto query=request->query("since"))
 {
  const auto parsed=std::from_chars(query->data(),query->data()+query->size(),since);
  if(parsed.ec!=std::errc{} || parsed.ptr!=query->data()+query->size())
  {
   (void)response.text(400,"Invalid frame revision");
   return;
  }
 }

 const auto protocol=request->query("packets");
 const bool version2=packet_version()==2 && protocol==std::optional<std::string_view>{"2"};
 const bool packets=version2 || protocol==std::optional<std::string_view>{"1"};
 DisplayRegion region{};
 uint32_t scene{};
 size_t raw_bytes=0;
 bool full=false;
 {
  std::lock_guard<std::mutex> lock(mutex_);
  if(leased_)
  {
   (void)response.header("Retry-After","1");
   const char body[]="{\"error\":\"frame_busy\"}";
   (void)response.send(503,"application/json",{reinterpret_cast<const uint8_t *>(body),sizeof(body)-1});
   return;
  }
  if(display_config().cyclic || (scene_revision_floor_ && since<=scene_revision_floor_)) since=0;
  DisplayRegions regions;
  const bool captured=version2 ? display_frame_regions(since,regions) : display_frame_snapshot(since,region);
  if(version2) region.revision=regions.revision;
  if(!captured || region.revision==scene_revision_floor_)
  {
   (void)response.header("Retry-After","1");
   const char body[]="{\"error\":\"frame_warming_up\"}";
   (void)response.send(503,"application/json",{reinterpret_cast<const uint8_t *>(body),sizeof(body)-1});
   return;
  }
  scene=scene_.load();
  if(version2 && regions.count)
  {
   const auto plan=prepare_regions(regions);
   region=plan.extent;raw_bytes=plan.raw_bytes;full=plan.full;
   leased_=version2_=true;leased_scene_=scene;rle_=display_config().rle;
  }
  else if(region.width)
  {
   version2_=false;
   // Even endpoints make every RGB565 BMP row DWORD-aligned.
   const auto right=std::min(width_,(region.x+region.width+1u)&~1u);
   region.x &= ~1u;
   region.width=right-region.x;
   region_=region;
   packets_=packets;
   leased_scene_=scene;
   const size_t row_bytes=size_t(region.width)*2;
   const size_t pixels=row_bytes*region.height;
   const size_t rows_per_packet=native_view::packet_payload_limit/row_bytes;
   bytes_=packets ? pixels+native_view::packet_header_bytes*
       ((region.height+rows_per_packet-1)/rows_per_packet) : header_.size()+pixels;
   header_.fill(0);
   header_[0]='B'; header_[1]='M';
   auto *h=header_.data();
   little(h+2,bytes_,4); little(h+10,header_.size(),4); little(h+14,40,4);
   little(h+18,region.width,4); little(h+22,uint32_t(-int32_t(region.height)),4);
   little(h+26,1,2); little(h+28,16,2); little(h+30,3,4);
   little(h+34,pixels,4);
   little(h+54,0xf800,4); little(h+58,0x07e0,4); little(h+62,0x001f,4);
   leased_=true;
  }
 }

 (void)response.header("X-Frame-Revision",std::to_string(region.revision));
 (void)response.header("X-Frame-Scene",std::to_string(scene));
 if(!region.width)
 {
  (void)response.send(204,"application/octet-stream",{});
  return;
 }
 (void)response.header("X-Frame-X",std::to_string(region.x));
 (void)response.header("X-Frame-Y",std::to_string(region.y));
 (void)response.header("X-Frame-Width",std::to_string(width_));
 (void)response.header("X-Frame-Height",std::to_string(height_));
 (void)response.header("X-Frame-Crop-Height",std::to_string(region.height));
 if(version2)
 {
  (void)response.header("X-Frame-Crop-Width",std::to_string(region.width));
  (void)response.header("X-Frame-Raw-Bytes",std::to_string(raw_bytes));
  (void)response.header("X-Frame-Full",full?"1":"0");
 }
 OwnedResponseSource source({this,bytes_,[](void *context,size_t offset,uint8_t *out,size_t capacity)->BodyReadResult
 {
  auto &self=*static_cast<FrameApi *>(context);
  if(self.version2_) return self.read_regions(out,capacity);
  if(offset>=self.bytes_) return {};
  const auto count=self.read_stream(offset,out,capacity);
  return {count ? BodyReadStatus::Data : BodyReadStatus::TransportError,count};
 },version2},[](void *context)
 {
  auto &self=*static_cast<FrameApi *>(context);
  std::lock_guard<std::mutex> lock(self.mutex_);
  self.leased_=false;
 });
#if CONFIG_NAWSERVER_TCP_MANAGED
 const auto result=response.sendOwnedSource(200,packets?"application/x-lvgl-frame":"image/bmp",std::move(source));
#else
 const auto result=response.sendSource(200,packets?"application/x-lvgl-frame":"image/bmp",source.view());
#endif
 if(result!=SendResult::Ok) ESP_LOGW("frame_api","Frame send failed: %u",unsigned(result));
}
