// SPDX-License-Identifier: MIT AND CC0-1.0
// Copyright (c) 2026 Oleg Kozhevnikov
// SPDX-FileCopyrightText: 2022 Espressif Systems (Shanghai) CO LTD
// Reset/init portions follow the CC0 Waveshare/Espressif example.
// See the root THIRD_PARTY_NOTICES.md for pinned origin and CC0 text.
// RGB wiring and frame ownership adapted from ESP32-yaidfws touch_lcd7.
// Owner-authored adaptation; licensed under MIT by the owner on 2026-10-30.
#include "board.hpp"
#include "lvgl.h"
#include "driver/i2c.h"
#include "driver/gpio.h"
#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "nvs.h"
#include "esp_random.h"
#include <array>
#include <mutex>
#if LVGL_CBOR_DEMO_TOUCH
#include "esp_lcd_panel_io.h"
#include "esp_lcd_touch_gt911.h"
#endif
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include <cstdlib>
#include <cstring>
#include <algorithm>
#ifndef LVGL_CBOR_DISPLAY_FEEDBACK
#define LVGL_CBOR_DISPLAY_FEEDBACK 1
#endif
namespace
{
	esp_lcd_panel_handle_t panel;
	StaticSemaphore_t event_storage; SemaphoreHandle_t event;
	uint32_t frames{}, vsyncs{};
	const uint16_t *last_frame{};
	std::mutex framebuffer_mutex;
	DisplayConfig active_config;
	bool render_locked{};
#if LVGL_CBOR_DISPLAY_FEEDBACK
	DisplayRegions pending_regions;
	std::array<DisplayRegion,192> dirty_history{};
	size_t dirty_head{}, dirty_count{};
	uint32_t revision{}, history_floor{};

	void merge(DisplayRegion &region, const DisplayRegion &next)
	{
		if(!next.width) return;
		if(!region.width) { region=next; return; }
		const auto right=std::max(region.x+region.width,next.x+next.width);
		const auto bottom=std::max(region.y+region.height,next.y+next.height);
		region.x=std::min(region.x,next.x);
		region.y=std::min(region.y,next.y);
		region.width=right-region.x;
		region.height=bottom-region.y;
	}

	uint32_t pixels(const DisplayRegion &region) { return region.width * region.height; }

	void add_region(DisplayRegions &regions, DisplayRegion next)
	{
		for(size_t i=0; i<regions.count;)
		{
			auto joined=regions.items[i];
			merge(joined,next);
			if(pixels(joined)>pixels(regions.items[i])+pixels(next)) { ++i; continue; }
			next=joined;
			regions.items[i]=regions.items[--regions.count];
			i=0;
		}
		if(regions.count==regions.items.size())
		{
			// Bounded metadata: recover with a complete screen if it overflows.
			regions.items[0]={0,0,800,480,0};
			regions.count=1;
			return;
		}
		regions.items[regions.count++]=next;
	}


#endif

	void publish_frame(const uint8_t *pixels)
	{
		last_frame = reinterpret_cast<const uint16_t *>(pixels);
#if LVGL_CBOR_DISPLAY_FEEDBACK
		if(!++revision)
		{
			++revision;
			dirty_count=dirty_head=0;
			history_floor=0;
		}
		for(size_t i=0;i<pending_regions.count;++i)
		{
			if(dirty_count==dirty_history.size()) history_floor=dirty_history[dirty_head].revision;
			else ++dirty_count;
			auto region=pending_regions.items[i];
			region.revision=revision;
			dirty_history[dirty_head]=region;
			dirty_head=(dirty_head+1)%dirty_history.size();
		}

#endif
	}

	void refresh_event(lv_event_t *event)
	{
		if(lv_event_get_code(event) == LV_EVENT_REFR_START)
		{
#if LVGL_CBOR_DISPLAY_FEEDBACK
			pending_regions.count = 0;
#endif
			// With two buffers LVGL renders to the other buffer. DIRECT sync
			// copies from the published buffer into that render target.
			if(active_config.buffers == 1)
			{
				framebuffer_mutex.lock();
				render_locked = true;
			}
			return;
		}
		// A refresh with no invalidation has no final flush to release it.
		if(render_locked)
		{
			render_locked = false;
			framebuffer_mutex.unlock();
		}
	}

	uint32_t touch_errors{};
	bool touch_ready{};
#if LVGL_CBOR_DEMO_TOUCH
	esp_lcd_touch_handle_t touch_controller;
	void touch_read(lv_indev_t *, lv_indev_data_t *data)
	{
		const auto result = esp_lcd_touch_read_data(touch_controller);
		esp_lcd_touch_point_data_t point{}; uint8_t count{};
		if(result != ESP_OK || esp_lcd_touch_get_data(touch_controller, &point, &count, 1) != ESP_OK)
		{
			__atomic_fetch_add(&touch_errors, 1u, __ATOMIC_RELAXED); data->state = LV_INDEV_STATE_RELEASED; return;
		}

		data->state = count ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
		if(count){data->point.x = std::min<uint16_t>(point.x, 799); data->point.y = std::min<uint16_t>(point.y, 479);}
	}

	esp_err_t initialize_touch(lv_display_t *display)
	{
		esp_lcd_panel_io_i2c_config_t io_config{}; io_config.dev_addr = ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS;
		io_config.control_phase_bytes = 1; io_config.lcd_cmd_bits = 16; io_config.flags.disable_control_phase = 1;
		esp_lcd_panel_io_handle_t io{};
		auto result = esp_lcd_new_panel_io_i2c(static_cast<esp_lcd_i2c_bus_handle_t>(I2C_NUM_0), &io_config, &io);
		if(result != ESP_OK) return result;

		esp_lcd_touch_config_t config{}; config.x_max = 800; config.y_max = 480;
		config.rst_gpio_num = GPIO_NUM_NC; config.int_gpio_num = GPIO_NUM_NC;
		result = esp_lcd_touch_new_i2c_gt911(io, &config, &touch_controller);
		if(result != ESP_OK){esp_lcd_panel_io_del(io); return result;}

		auto *input = lv_indev_create(); if(!input)
		{
			esp_lcd_touch_del(touch_controller); touch_controller = nullptr; esp_lcd_panel_io_del(io);
			return ESP_ERR_NO_MEM;
		}

		lv_indev_set_type(input, LV_INDEV_TYPE_POINTER); lv_indev_set_display(input, display);
		lv_indev_set_read_cb(input, touch_read);
		touch_ready = true; return ESP_OK;
	}

#endif
	uint32_t read(const uint32_t &value)
	{
		return __atomic_load_n(&value, __ATOMIC_ACQUIRE);
	}

	bool IRAM_ATTR frame(esp_lcd_panel_handle_t, const esp_lcd_rgb_panel_event_data_t *, void *)
	{
		__atomic_fetch_add(&frames, 1u, __ATOMIC_RELEASE); BaseType_t wake = pdFALSE;
		xSemaphoreGiveFromISR(event, &wake); return wake == pdTRUE;
	}

	bool IRAM_ATTR vsync(esp_lcd_panel_handle_t, const esp_lcd_rgb_panel_event_data_t *, void *)
	{
		__atomic_fetch_add(&vsyncs, 1u, __ATOMIC_RELEASE); BaseType_t wake = pdFALSE;
		xSemaphoreGiveFromISR(event, &wake); return wake == pdTRUE;
	}

	void wait(const uint32_t &counter, uint32_t before)
	{
		const auto started = xTaskGetTickCount(); while(read(counter) == before)
		{
			if(xTaskGetTickCount() - started > pdMS_TO_TICKS(500))
				abort();

			xSemaphoreTake(event, pdMS_TO_TICKS(50));
		}
	}

	void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pixels)
	{

#if LVGL_CBOR_DISPLAY_FEEDBACK
		add_region(pending_regions,{uint32_t(area->x1),uint32_t(area->y1),
		    uint32_t(lv_area_get_width(area)),uint32_t(lv_area_get_height(area)),0});

#else
		(void)area;
#endif
		// DIRECT supplies the full framebuffer pointer for each dirty area.
		// Submit only the last area, once all writes to that buffer are complete.
		if(lv_display_flush_is_last(display))
		{
			if(render_locked)
			{
				// All drawing into the single buffer is complete. DMA only
				// reads it, so HTTP copies can run while waiting for scanout.
				publish_frame(pixels);
				render_locked = false;
				framebuffer_mutex.unlock();
			}
			ESP_ERROR_CHECK(esp_lcd_panel_draw_bitmap(panel, 0, 0, 800, 480, pixels));
			wait(frames, read(frames));
			wait(vsyncs, read(vsyncs));
			if(active_config.buffers == 2)
			{
				// Wait out readers of the previous frame before LVGL can
				// swap and start writing into that buffer on its next refresh.
				std::lock_guard<std::mutex> lock(framebuffer_mutex);
				publish_frame(pixels);
			}
		}
		lv_display_flush_ready(display);
	}

	esp_err_t expander(uint8_t address, uint8_t value)
	{
		return i2c_master_write_to_device(I2C_NUM_0, address, &value, 1, pdMS_TO_TICKS(100));
	}

}
uint32_t display_frame_count()
{
	return read(frames);
}

uint16_t display_pixel(int32_t x, int32_t y)
{
	std::lock_guard<std::mutex> lock(framebuffer_mutex);
	return last_frame && x >= 0 && x < 800 && y >= 0 && y < 480 ? last_frame[y * 800 + x] : 0;
}

bool display_touch_available()
{
	return touch_ready;
}

uint32_t display_touch_errors()
{
	return __atomic_load_n(&touch_errors, __ATOMIC_RELAXED);
}

esp_err_t initialize_display()
{
	return initialize_display(display_config_saved(), nullptr);
}

esp_err_t initialize_display(const DisplayConfig &configuration, void (*milestone)(const char *))
{
	active_config = configuration;
	if(milestone)
	{
		lv_init();
		milestone("lvgl");
	}
#if LVGL_CBOR_DISPLAY_FEEDBACK
	revision=esp_random();
#endif
	i2c_config_t bus{}; bus.mode = I2C_MODE_MASTER; bus.sda_io_num = 8; bus.scl_io_num = 9;
	bus.sda_pullup_en = GPIO_PULLUP_ENABLE; bus.scl_pullup_en = GPIO_PULLUP_ENABLE; bus.master.clk_speed = 400000;
	ESP_ERROR_CHECK(i2c_param_config(I2C_NUM_0, &bus));
	ESP_ERROR_CHECK(i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0));
	ESP_ERROR_CHECK(expander(0x24, 0x01)); ESP_ERROR_CHECK(gpio_set_direction(GPIO_NUM_4, GPIO_MODE_OUTPUT));
	ESP_ERROR_CHECK(expander(0x38, 0x2c)); vTaskDelay(pdMS_TO_TICKS(100)); gpio_set_level(GPIO_NUM_4, 0);
	vTaskDelay(pdMS_TO_TICKS(100)); ESP_ERROR_CHECK(expander(0x38, 0x2e)); vTaskDelay(pdMS_TO_TICKS(200));
	ESP_ERROR_CHECK(gpio_set_direction(GPIO_NUM_4, GPIO_MODE_INPUT));
	esp_lcd_rgb_panel_config_t config{}; config.clk_src = LCD_CLK_SRC_DEFAULT; config.timings.pclk_hz = 12000000;
	config.timings.h_res = 800; config.timings.v_res = 480;
	config.timings.hsync_pulse_width = 4; config.timings.hsync_back_porch = 8; config.timings.hsync_front_porch = 8;
	config.timings.vsync_pulse_width = 4; config.timings.vsync_back_porch = 8; config.timings.vsync_front_porch = 8;
	config.timings.flags.pclk_active_neg = 1;
	config.data_width = 16; config.bits_per_pixel = 16; config.num_fbs = active_config.buffers; config.bounce_buffer_size_px = 800 * 16;
	config.dma_burst_size = 64;
	config.hsync_gpio_num = 46; config.vsync_gpio_num = 3; config.de_gpio_num = 5; config.pclk_gpio_num = 7;
	config.disp_gpio_num = -1;
	const int pins[]{14, 38, 18, 17, 10, 39, 0, 45, 48, 47, 21, 1, 2, 42, 41, 40};
	std::copy(pins, pins + 16, config.data_gpio_nums); config.flags.fb_in_psram = 1;
	ESP_ERROR_CHECK(esp_lcd_new_rgb_panel(&config, &panel)); ESP_ERROR_CHECK(esp_lcd_panel_reset(panel));
	ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
	event = xSemaphoreCreateBinaryStatic(&event_storage); if(!event) return ESP_ERR_NO_MEM;

	esp_lcd_rgb_panel_event_callbacks_t callbacks{}; callbacks.on_frame_buf_complete = frame;
	callbacks.on_vsync = vsync; ESP_ERROR_CHECK(esp_lcd_rgb_panel_register_event_callbacks(panel, &callbacks, nullptr));
	void *front = nullptr, *back = nullptr;
	if(active_config.buffers==2)
		ESP_ERROR_CHECK(esp_lcd_rgb_panel_get_frame_buffer(panel, 2, &front, &back));
	else
		ESP_ERROR_CHECK(esp_lcd_rgb_panel_get_frame_buffer(panel, 1, &back));
	if(milestone) milestone("display_buffers");
	else lv_init();

	auto *display = lv_display_create(800, 480); if(!display) return ESP_ERR_NO_MEM;

	lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
	lv_display_set_buffers(display, back, front, 800 * 480 * 2, active_config.direct ? LV_DISPLAY_RENDER_MODE_DIRECT : LV_DISPLAY_RENDER_MODE_FULL);
	lv_display_add_event_cb(display,refresh_event,LV_EVENT_REFR_START,nullptr);
	lv_display_add_event_cb(display,refresh_event,LV_EVENT_REFR_READY,nullptr);
	lv_display_set_flush_cb(display, flush);
#if LVGL_CBOR_DEMO_TOUCH
	const auto touch_result = initialize_touch(display);
	if(touch_result != ESP_OK) ESP_LOGW("style_lab", "GT911 unavailable: %s", esp_err_to_name(touch_result));

#endif
	return expander(0x38, 0x1e);
}

bool display_copy_frame(uint8_t *out,size_t stride,uint32_t width,uint32_t height)
{
 std::lock_guard<std::mutex> lock(framebuffer_mutex);
 if(!out || !last_frame || width!=800 || height!=480 || stride<width*2)return false;
 for(uint32_t y=0;y<height;++y)
 {
  std::memcpy(out+y*stride,last_frame+y*width,width*2);
  std::memset(out+y*stride+width*2,0,stride-width*2);
 }
 return true;
}

bool display_transfer_available(bool cyclic)
{
	constexpr bool supported[]{LVGL_CBOR_TRANSFER_DIRTY,LVGL_CBOR_TRANSFER_CYCLIC};
	return supported[cyclic];
}

DisplayConfig display_config() { return active_config; }

DisplayConfig display_config_saved()
{
	nvs_handle_t nvs;
	uint8_t packed=0;
	if(nvs_open("lcd_view",NVS_READONLY,&nvs)==ESP_OK)
	{
		nvs_get_u8(nvs,"config",&packed);
		nvs_close(nvs);
	}
	DisplayConfig config;
	if(packed>=1 && packed<=32)
	{
		const unsigned bits=packed-1;
		config={bool(bits&2),uint8_t((bits&1)+1),bool(bits&4),bool(bits&8),!bool(bits&16)};
	}
	if(!display_transfer_available(config.cyclic))config.cyclic=!config.cyclic;
	return config;
}

esp_err_t display_config_save(DisplayConfig config)
{
	if(config.buffers<1 || config.buffers>2 || !display_transfer_available(config.cyclic)) return ESP_ERR_INVALID_ARG;
	nvs_handle_t nvs;
	auto result=nvs_open("lcd_view",NVS_READWRITE,&nvs);
	if(result!=ESP_OK) return result;
	result=nvs_set_u8(nvs,"config",config.buffers+(config.direct?2:0)+(config.cyclic?4:0)+(config.rle?8:0)+(config.rle_buffer?0:16));
	if(result==ESP_OK) result=nvs_commit(nvs);
	nvs_close(nvs);
	return result;
}

#if LVGL_CBOR_DISPLAY_FEEDBACK
bool display_frame_regions(uint32_t since,DisplayRegions &regions)
{
	std::lock_guard<std::mutex> lock(framebuffer_mutex);
	if(!last_frame || !revision) return false;
	regions.count=0;
	regions.revision=revision;
	if(since==revision) return true;
	if(!since || since>revision || since<history_floor)
	{
		regions.items[regions.count++]={0,0,800,480,revision};
		return true;
	}
	// Visit newest first; the history is monotonic within a boot.
	for(size_t n=0;n<dirty_count;++n)
	{
		const auto &entry=dirty_history[(dirty_head+dirty_history.size()-1-n)%dirty_history.size()];
		if(entry.revision<=since) break;
		add_region(regions,entry);
	}
	return true;
}

bool display_frame_snapshot(uint32_t since,DisplayRegion &region)
{
	DisplayRegions regions;
	if(!display_frame_regions(since,regions)) return false;
	region={};
	for(size_t i=0;i<regions.count;++i) merge(region,regions.items[i]);
	region.revision=regions.revision;
	return true;
}

bool display_with_region(const DisplayRegion &region,void *context,void (*read)(void *,const uint16_t *,size_t))
{
	std::lock_guard<std::mutex> lock(framebuffer_mutex);
	if(!last_frame || !region.width || !region.height || region.x>=800 || region.y>=480 ||
	    region.width>800-region.x || region.height>480-region.y) return false;
	read(context,last_frame+region.y*800+region.x,800);
	return true;
}

bool display_copy_region(const DisplayRegion &region,size_t offset,uint8_t *out,size_t count)
{
	if(!out || !region.width || !region.height || region.x>=800 || region.y>=480 ||
	    region.width>800-region.x || region.height>480-region.y) return false;
	const size_t row_bytes=region.width*2,total=row_bytes*region.height;
	if(offset>total || count>total-offset) return false;
	std::lock_guard<std::mutex> lock(framebuffer_mutex);
	if(!last_frame) return false;
	if(region.width==800)
	{
		const auto *pixels=reinterpret_cast<const uint8_t *>(last_frame+region.y*800);
		std::memcpy(out,pixels+offset,count);
		return true;
	}
	while(count)
	{
		const size_t row=offset/row_bytes,column=offset%row_bytes;
		const size_t take=std::min(count,row_bytes-column);
		const auto *pixels=reinterpret_cast<const uint8_t *>(last_frame+(region.y+row)*800+region.x);
		std::memcpy(out,pixels+column,take);
		out+=take;
		offset+=take;
		count-=take;
	}
	return true;
}

#endif
