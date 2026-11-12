// SPDX-License-Identifier: MIT
// Panel wiring/initialization parameters adapted from LilyGo-Display-IDF/display_s3.c.
// Copyright (c) 2024 Shenzhen Xinyuan Electronic Technology Co., Ltd.
// See ../NOTICE. The LVGL 9 adapter and buffer ownership below are independently authored.
#include "board.hpp"
#include "../../common/native_view/partial_capture.hpp"
#include "esp_random.h"
#include "driver/gpio.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <algorithm>
#include <cassert>

namespace {
esp_lcd_panel_handle_t panel;
uint32_t flushes{};
native_view::PartialCapture capture;
bool capture_active{}, capture_complete{}, capture_passive{}, capture_forced{}, capture_rendering{}, capture_invalidating{}, rendering{};
constexpr unsigned band_count=(display_height+display_band_rows-1)/display_band_rows;
constexpr uint32_t all_bands=(uint32_t(1)<<band_count)-1;
std::array<uint32_t,band_count> band_revision{};
uint32_t damage_revision{}, live_scene{}, scene_revision{}, pending_damage{};
lv_area_t capture_area{};
int64_t capture_start{},last_flush{};
uint32_t capture_revision{},capture_boot{},capture_scene{};
bool IRAM_ATTR transferred(esp_lcd_panel_io_handle_t,esp_lcd_panel_io_event_data_t *,void *context) {
  __atomic_fetch_add(&flushes,1u,__ATOMIC_RELAXED);
  lv_display_flush_ready(static_cast<lv_display_t *>(context));return false;
}
uint32_t band_mask(const lv_area_t &area)
{
  const auto first=unsigned(area.y1)/display_band_rows;
  const auto end=unsigned(area.y2)/display_band_rows+1;
  return ((uint32_t(1)<<end)-1) & ~((uint32_t(1)<<first)-1);
}
void track_invalidation(lv_event_t *event)
{
  if(!capture_invalidating && !rendering)
    pending_damage|=band_mask(*static_cast<const lv_area_t *>(lv_event_get_param(event)));
}
void render_start(lv_event_t *) {rendering=true;}
void refresh_ready(lv_event_t *) {rendering=false;pending_damage=0;}

void flush(lv_display_t *,const lv_area_t *area,uint8_t *pixels) {
  auto dirty=band_mask(*area);
  // A capture redraw may also consume normal LVGL invalidations that were pending.
  if(capture_rendering)dirty&=pending_damage;
  if(dirty)
  {
    last_flush=esp_timer_get_time();
    if(!++damage_revision)
    {
      damage_revision=scene_revision=1;
      band_revision.fill(0);
    }
    for(;dirty;dirty&=dirty-1)band_revision[__builtin_ctz(dirty)]=damage_revision;
  }
  if(capture_active && !capture_complete) {
    const auto width=lv_area_get_width(area),height=lv_area_get_height(area);
    capture.observe(area->x1,area->y1,width,height,pixels,lv_draw_buf_width_to_stride(width,LV_COLOR_FORMAT_RGB565));
  }
  ESP_ERROR_CHECK(esp_lcd_panel_draw_bitmap(panel,area->x1,area->y1,area->x2+1,area->y2+1,pixels));
}
uint32_t ticks(){return uint32_t(esp_timer_get_time()/1000);}
struct Command {uint8_t code,length;uint8_t data[14];};
const Command commands[]{
  {0xb2,5,{0x0b,0x0b,0,0x33,0x33}},{0xb7,1,{0x75}},{0xbb,1,{0x28}},
  {0xc0,1,{0x2c}},{0xc2,1,{1}},{0xc3,1,{0x1f}},{0xc6,1,{0x13}},
  {0xd0,1,{0xa7}},{0xd0,2,{0xa4,0xa1}},{0xd6,1,{0xa1}},
  {0xe0,14,{0xf0,5,0x0a,6,6,3,0x2b,0x32,0x43,0x36,0x11,0x10,0x2b,0x32}},
  {0xe1,14,{0xf0,8,0x0c,0x0b,9,0x24,0x2b,0x22,0x43,0x38,0x15,0x16,0x2f,0x37}}
};
}
uint32_t display_flush_count(){return __atomic_load_n(&flushes,__ATOMIC_RELAXED);}
uint32_t display_scene_id(uint32_t generation)
{
  if(!capture_boot)capture_boot=esp_random()|1;
  return capture_boot+generation;
}
void display_update_scene(uint32_t generation)
{
  const auto scene=display_scene_id(generation);
  if(scene==live_scene && scene_revision)return;
  live_scene=scene;
  if(!++damage_revision)
  {
    damage_revision=1;
    band_revision.fill(0);
  }
  scene_revision=damage_revision;
}
unsigned display_rows_in_band(unsigned band)
{
  return std::min(display_band_rows,display_height-band*display_band_rows);
}
size_t display_band_bytes(uint32_t mask)
{
  size_t bytes=0;
  for(unsigned band=0;band<band_count;++band)
    if(mask&(uint32_t(1)<<band))bytes+=display_rows_in_band(band)*display_width*2;
  return bytes;
}
DisplayBands display_bands_since(uint32_t revision)
{
  const bool full=!revision || revision<scene_revision || revision>damage_revision;
  uint32_t mask=full ? all_bands : 0;
  if(!full)
    for(unsigned band=0;band<band_count;++band)
      if(band_revision[band]>revision)mask|=uint32_t(1)<<band;
  return {live_scene,damage_revision,mask,full || mask==all_bands};
}
lv_display_t *initialize_display() {
  for(const auto pin:{GPIO_NUM_15,GPIO_NUM_9,GPIO_NUM_38})ESP_ERROR_CHECK(gpio_set_direction(pin,GPIO_MODE_OUTPUT));
  gpio_set_level(GPIO_NUM_15,1);gpio_set_level(GPIO_NUM_9,1);gpio_set_level(GPIO_NUM_38,0);
  lv_init();lv_tick_set_cb(ticks);
  auto *display=lv_display_create(display_width,display_height);assert(display);
  damage_revision=(esp_random() & 0x7fffffff) | 1;
  lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
  constexpr size_t buffer_bytes=320*20*2;
  auto *first=heap_caps_malloc(buffer_bytes,MALLOC_CAP_DMA|MALLOC_CAP_INTERNAL);
  auto *second=heap_caps_malloc(buffer_bytes,MALLOC_CAP_DMA|MALLOC_CAP_INTERNAL);assert(first&&second);
  lv_display_set_buffers(display,first,second,buffer_bytes,LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display,flush);
  lv_display_add_event_cb(display,track_invalidation,LV_EVENT_INVALIDATE_AREA,nullptr);
  lv_display_add_event_cb(display,render_start,LV_EVENT_RENDER_START,nullptr);
  lv_display_add_event_cb(display,refresh_ready,LV_EVENT_REFR_READY,nullptr);
  esp_lcd_i80_bus_handle_t bus{};esp_lcd_i80_bus_config_t bus_config{};
  bus_config.dc_gpio_num=7;bus_config.wr_gpio_num=8;bus_config.clk_src=LCD_CLK_SRC_DEFAULT;
  const int pins[]{39,40,41,42,45,46,47,48};std::copy(pins,pins+8,bus_config.data_gpio_nums);
  bus_config.bus_width=8;bus_config.max_transfer_bytes=buffer_bytes;
  ESP_ERROR_CHECK(esp_lcd_new_i80_bus(&bus_config,&bus));
  esp_lcd_panel_io_i80_config_t io_config{};io_config.cs_gpio_num=6;io_config.pclk_hz=10000000;
  io_config.trans_queue_depth=2;io_config.lcd_cmd_bits=8;io_config.lcd_param_bits=8;
  io_config.dc_levels.dc_data_level=1;io_config.flags.swap_color_bytes=1;
  io_config.on_color_trans_done=transferred;io_config.user_ctx=display;
  esp_lcd_panel_io_handle_t io{};ESP_ERROR_CHECK(esp_lcd_new_panel_io_i80(bus,&io_config,&io));
  esp_lcd_panel_dev_config_t panel_config{};panel_config.reset_gpio_num=5;
  panel_config.rgb_ele_order=LCD_RGB_ELEMENT_ORDER_RGB;panel_config.bits_per_pixel=16;
  ESP_ERROR_CHECK(esp_lcd_new_panel_st7789(io,&panel_config,&panel));
  ESP_ERROR_CHECK(esp_lcd_panel_reset(panel));ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
  for(const auto &cmd:commands)ESP_ERROR_CHECK(esp_lcd_panel_io_tx_param(io,cmd.code,cmd.data,cmd.length));
  ESP_ERROR_CHECK(esp_lcd_panel_invert_color(panel,true));ESP_ERROR_CHECK(esp_lcd_panel_swap_xy(panel,true));
  ESP_ERROR_CHECK(esp_lcd_panel_mirror(panel,false,true));ESP_ERROR_CHECK(esp_lcd_panel_set_gap(panel,0,35));
  ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(panel,true));gpio_set_level(GPIO_NUM_38,1);
  return display;
}

bool display_capture_begin(uint16_t y,uint16_t rows,bool passive,uint32_t scene)
{
  if(capture_active)return false;
  capture_scene=scene;
  capture_complete=false;
  if(!++capture_revision)++capture_revision;
  if(!capture.begin(320,170,y,rows,capture_revision,display_scene_id(scene)))return false;
  capture_area={0,y,319,y+rows-1};
  capture_start=esp_timer_get_time();
  capture_passive=passive;
  capture_forced=false;
  capture_active=true;
  return true;
}

bool display_capture_poll(uint8_t *&bytes,size_t &size,uint32_t scene)
{
  if(capture_scene!=scene) {bytes=nullptr;size=0;return true;}
  const auto now=esp_timer_get_time();
  size=capture.size();
  if(!size && !capture_passive && !capture_forced && now-capture_start>=15000 &&
      (now-last_flush>=20000 || now-capture_start>=35000))
  {
    // Normal LVGL refresh already ran this iteration. Only request this band
    // in an idle gap or at the capture deadline.
    capture_forced=true;
    capture_invalidating=true;
    if(auto *screen=lv_screen_active())lv_obj_invalidate_area(screen,&capture_area);
    capture_invalidating=false;
    capture_rendering=true;
    lv_refr_now(nullptr);
    capture_rendering=false;
    size=capture.size();
  }
  if(!size && now-capture_start<500000 && !capture_forced)return false;
  capture_complete=true;
  bytes=size ? capture.data() : nullptr;
  return true;
}

void display_capture_release()
{
  capture_active=false;
}
