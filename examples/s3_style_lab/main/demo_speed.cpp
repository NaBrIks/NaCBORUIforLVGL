// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Optional application demo; no generator or ESP event dependency enters core.
#include "demo_speed.hpp"
#include "demo_speed/model.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "cbor.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <atomic>

namespace lab_demo_speed
{
	namespace
	{
		ESP_EVENT_DEFINE_BASE(demo_cbor_event);
		constexpr size_t frame_bytes = 192;
		esp_event_loop_handle_t loop;
		esp_timer_handle_t timer;
		lvgl_cbor::DataRegistry *data;
		int64_t started_us, previous_slot;
		std::atomic<uint32_t> dropped{};

		size_t encode_event(uint8_t (&bytes)[frame_bytes], double kmh, uint64_t sequence)
		{
			CborEncoder encoder, event, value;
			cbor_encoder_init(&encoder, bytes, sizeof(bytes), 0);
			CborError result = cbor_encoder_create_map(&encoder, &event, 4);
			const auto key = [&](const char *text) {
					result = CborError(result | cbor_encode_text_stringz(&event, text));
				};
			key("v"); result = CborError(result | cbor_encode_uint(&event, 1));
			key("event"); result = CborError(result | cbor_encode_text_stringz(&event, "data_changed"));
			key("source"); result = CborError(result | cbor_encode_text_stringz(&event, "demo.speed"));
			key("value"); result = CborError(result | cbor_encoder_create_map(&event, &value, 3));
			result = CborError(result | cbor_encode_text_stringz(&value, "kmh"));
			result = CborError(result | cbor_encode_double(&value, kmh));
			result = CborError(result | cbor_encode_text_stringz(&value, "unit"));
			result = CborError(result | cbor_encode_text_stringz(&value, "km/h"));
			result = CborError(result | cbor_encode_text_stringz(&value, "sequence"));
			result = CborError(result | cbor_encode_uint(&value, sequence));
			result = CborError(result | cbor_encoder_close_container(&event, &value));
			result = CborError(result | cbor_encoder_close_container(&encoder, &event));
			return result == CborNoError ? cbor_encoder_get_buffer_size(&encoder, bytes) : 0;
		}

		bool publish_event(const uint8_t *bytes, size_t size, std::string &error)
		{
			CborParser parser; CborValue event, value;
			if(!size || size > frame_bytes || cbor_parser_init(bytes, size, 0, &parser, &event) != CborNoError ||
			    !cbor_value_is_map(&event) || cbor_value_map_find_value(&event, "value", &value) != CborNoError ||
			    !cbor_value_is_map(&value))
			{
				error = "demo_speed_event"; return false;
			}

			const auto *begin = cbor_value_get_next_byte(&value);
			if(cbor_value_advance(&value) != CborNoError) { error = "demo_speed_value"; return false; }

			const auto *end = cbor_value_get_next_byte(&value);
			// publish_cbor copies the value; neither registry nor callbacks retain the
			// borrowed esp_event payload. The source/schema are application declarations.
			return data->publish_cbor("demo.speed", begin, size_t(end - begin), error);
		}

		void dispatch(void *, esp_event_base_t, int32_t size, void *payload)
		{
			if(size <= 0 || size_t(size) > frame_bytes)  return;

			const auto *bytes = static_cast<const uint8_t *>(payload);
			std::string error;
			if(!publish_event(bytes, size_t(size), error))
			{
				ESP_LOGE("demo_speed", "CBOR publish rejected: %s", error.c_str()); return;
			}
		}

		void produce(void *)
		{
			const auto elapsed = esp_timer_get_time() - started_us;
			const auto slot = elapsed / sample_period_us;
			// Timer callbacks delayed by another service cannot produce catch-up bursts.
			if(slot <= previous_slot)  return;

			previous_slot = slot;
			uint8_t bytes[frame_bytes];
			const auto size = encode_event(bytes, speed_kmh(elapsed), uint64_t(slot));
			if(!size || esp_event_post_to(loop, demo_cbor_event, int32_t(size), bytes, size, 0) != ESP_OK)
				++dropped;
		}

	} // namespace

	bool register_data(lvgl_cbor::DataRegistry &registry, std::string &error)
	{
		using lvgl_cbor::DataSchema;
		if(!registry.add_group({"demo", "Demonstration", "Code-generated sources", ""}, error))return false;

		auto speed = DataSchema::number(0, 180); speed.title = "Speed"; speed.unit = "km/h";
		speed.description = "Smooth generated trajectory";
		if(!registry.add_source({"demo.speed", DataSchema::object({
				{"kmh", speed}, {"unit", DataSchema::text(8)},
				{"sequence", DataSchema::integer(0)}}), {}, "Demo speed", "Autonomous 25 Hz CBOR demonstration",
		                         "demo"}, error)) return false;

		data = &registry;
		uint8_t bytes[frame_bytes]; const auto size = encode_event(bytes, 0, 0);
		return publish_event(bytes, size, error);
	}

	bool begin(std::string &error)
	{
		if(timer)  return true;

		if(!data) { error = "demo_speed_not_registered"; return false; }

		esp_event_loop_args_t config{}; config.queue_size = 4; config.task_name = nullptr;
		auto result = esp_event_loop_create(&config, &loop);
		if(result != ESP_OK) { error = esp_err_to_name(result); return false; }

		result = esp_event_handler_register_with(loop, demo_cbor_event, ESP_EVENT_ANY_ID, dispatch, nullptr);
		if(result == ESP_OK)
		{
			esp_timer_create_args_t args{}; args.callback = produce; args.name = "demo_speed";
			args.dispatch_method = ESP_TIMER_TASK; args.skip_unhandled_events = true;
			result = esp_timer_create(&args, &timer);
		}

		if(result == ESP_OK)
		{
			started_us = esp_timer_get_time(); previous_slot = 0;
			result = esp_timer_start_periodic(timer, sample_period_us);
		}

		if(result == ESP_OK)  return true;

		if(timer) { (void)esp_timer_delete(timer); timer = nullptr; }

		(void)esp_event_loop_delete(loop); loop = nullptr;
		error = esp_err_to_name(result); return false;
	}

	void process()
	{
		if(loop)  (void)esp_event_loop_run(loop, 0);
	}

	uint32_t dropped_events()
	{
		return dropped.load();
	}

} // namespace lab_demo_speed
