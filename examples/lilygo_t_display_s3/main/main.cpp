// SPDX-License-Identifier: MIT
#include "board.hpp"
#include "../../common/native_view/pointer.hpp"
#if LILYGO_NATIVE_WS
#include "view_network.hpp"
#include "esp_netif_ip_addr.h"
#endif
#include "appearance.hpp"
#include "demo_data.hpp"
#include "../../common/sample_image.hpp"
#include "project.generated.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "driver/gpio.h"
#include "driver/usb_serial_jtag.h"
#include "driver/usb_serial_jtag_vfs.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <array>
#include <cstdio>
#include <cstring>
#include <memory>
#include <limits>

using namespace lvgl_cbor;
namespace
{
	const DataValue *field(const DataValue &value, const char *name)
	{
		const auto *object = std::get_if<DataValue::Object>(&value.value);
		if(!object) return nullptr;
		const auto it = object->find(name);
		return it == object->end() ? nullptr : &it->second;
	}

	const std::string *text(const DataValue *value)
	{
		return value ? std::get_if<std::string>(&value->value) : nullptr;
	}

	DataValue failure(const std::string &error)
	{
		return DataValue::Object{{"ok", false}, {"error", error}};
	}

	void emit(const DataValue &value)
	{
		const auto line = data_value_json(value); printf("@ui %s\n", line.c_str()); fflush(stdout);
	}

	class Demo
	{
		Appearance appearance_;
		DemoData data_;
		std::vector<Resource> resources_;
		ConstProjectSource source_{project_bytes, sizeof(project_bytes),
								   {"rom", "compiled demo", true, false, "available"}};
		std::unique_ptr<ProjectService> project_;
#if LILYGO_NATIVE_WS
		uint32_t previous_address_{};
#endif
	public:
		Demo() : resources_(appearance_.resources()) {}

		bool begin(lv_display_t *display, std::string &error)
		{
			resources_.push_back({"montserrat_12", "const lv_font_t *", &lv_font_montserrat_12});
			resources_.push_back({"montserrat_14", "const lv_font_t *", &lv_font_montserrat_14});
			resources_.push_back({"montserrat_20", "const lv_font_t *", &lv_font_montserrat_20});
			resources_.push_back({"montserrat_28", "const lv_font_t *", &lv_font_montserrat_28});
			resources_.push_back({"ui_sample_image_small", "const void *", &demo_small_image::image});
			if(!data_.begin(error) ||
			    !appearance_.load({scheme_bytes, sizeof(scheme_bytes), {}}, "cream",
			        resources_.data(), resources_.size(), error)) return false;
			if(!appearance_.install_popup_theme(display, &lv_font_montserrat_14, 2))
			{
				error = "Cannot create appearance theme";
				return false;
			}
			if(!data_.registry.add_source({"system.network",
			        DataSchema::object({{"connected", DataSchema::boolean()}, {"ip", DataSchema::text(15)}})},
			        error) ||
			    !data_.registry.publish("system.network", DataValue::Object{{"connected", false}, {"ip", "—"}},
			        error) ||
			    !data_.registry.add_source({"ui.scheme",
			        DataSchema::object({{"id", DataSchema::text(12)}, {"title", DataSchema::text(256)}})}, error) ||
			    !data_.registry.add_action({"ui.select_scheme", DataSchema::text(12),
			        [this](const DataValue &value, std::string &e){
				        const auto &id = std::get<std::string>(value.value);
				        if(!appearance_.select(id, e)) return false;
				        for(const auto &choice : appearance_.choices())
					        if(choice.id == id)
						        return data_.registry.publish("ui.scheme",
						            DataValue::Object{{"id", choice.id}, {"title", choice.title}}, e);
				        e = "Selected scheme missing from catalog";
				        return false;
			        }}, error) ||
			    !data_.registry.write("demo.text", {}, "Text", error) ||
			    !data_.registry.invoke("ui.select_scheme", "cream", error)) return false;
			data_.registry.flush();
			project_ = std::make_unique<ProjectService>(source_, nullptr, ProjectPolicy{},
			        ProjectLimits{256 * 1024, 128}, resources_.data(), resources_.size(), nullptr,
			        std::vector<ProjectStorageInfo>{}, &data_.registry);
			if(!project_->begin(error)) return false;
			ScreenReply reply{};
			if(!project_->load_screen("shell", reply)){error = reply.error; return false;}
			sync();
			return true;
		}

		uint32_t capture_scene() const { return project_->display_generation(); }

		void sync()
		{
			data_.registry.flush();
		}

		void tick()
		{
			std::string error;
#if LILYGO_NATIVE_WS
			const auto address=view_network_ipv4();
			if(address!=previous_address_)
			{
				char ip[16]="—";
				if(address)
				{
					const esp_ip4_addr_t value{address};
					std::snprintf(ip,sizeof(ip),IPSTR,IP2STR(&value));
				}

				if(data_.registry.publish("system.network",
				    DataValue::Object{{"connected", address!=0}, {"ip", ip}},error))
					previous_address_=address;
				else ESP_LOGW("nacborui", "Publish network status: %s", error.c_str());
			}
#endif
			if(!data_.tick(error)) ESP_LOGW("nacborui", "Demo tick: %s", error.c_str());
		}

		void next_page()
		{
			const auto status = project_->status();
			const auto page = status.views.empty() ? std::string{} : status.views[0].selected;
			const char *target = page == "home" ? "go_controls" : page == "controls" ? "go_schemes" : "go_home";
			if(auto *node = project_->find(target)) lv_obj_send_event(node, LV_EVENT_CLICKED, nullptr);
			sync();
		}

		void next_scheme()
		{
			const auto &choices = appearance_.choices();
			if(choices.empty()) return;
			size_t index = 0;
			for(size_t i = 0; i < choices.size(); i++)
				if(choices[i].id == appearance_.selected()) index = (i + 1) % choices.size();

			std::string error; if(!data_.registry.invoke("ui.select_scheme", choices[index].id, error))
				ESP_LOGW("nacborui", "Select scheme: %s", error.c_str());

			sync();
		}

		lv_obj_t *find_node(const DataValue &request, const std::string &id)
		{
			const auto *instance = field(request, "instance");
			if(!instance) return project_->find(id.c_str());
			const auto *number = std::get_if<int64_t>(&instance->value);
			if(!number || *number <= 0 || *number > std::numeric_limits<uint32_t>::max()) return nullptr;
			return project_->find(uint32_t(*number), id.c_str());
		}

		DataValue command(const DataValue &request)
		{
			const auto *operation = text(field(request, "op"));
			if(!operation) return failure("Missing or invalid op");
			const auto &op = *operation;
			const auto *requested = field(request, "nodes");
			const auto *list = requested ? std::get_if<DataValue::Array>(&requested->value) : nullptr;
			if(requested && (!list || list->size() > 32)) return failure("Invalid node inspection list");
			if(list)
				for(const auto &item : *list)
					if(!text(field(item, "id"))) return failure("Missing or invalid inspection id");

			std::string error;
			if(op == "scheme")
			{
				const auto *scheme = field(request, "scheme");
				if(!text(scheme)) return failure("Missing or invalid scheme");
				if(!data_.registry.invoke("ui.select_scheme", *scheme, error)) return failure(error);
			}
			else if(op == "publish" || op == "write" || op == "invoke")
			{
				const auto *name = text(field(request, op == "invoke" ? "action" : "source"));
				const auto *value = field(request, "value");
				if(!name || !value) return failure("Missing name or value");
				const bool ok = op == "publish" ? data_.registry.publish(*name, *value, error) :
				    op == "write" ? data_.registry.write(*name, {}, *value, error) :
				    data_.registry.invoke(*name, *value, error);
				if(!ok) return failure(error);
			}
			else if(op == "click" || op == "event")
			{
				const auto *id = text(field(request, "node"));
				if(!id) return failure("Missing or invalid node");
				auto *node = find_node(request, *id);
				if(!node) return failure("Unknown node or instance");
				lv_event_code_t code = LV_EVENT_CLICKED;
				uint32_t key = 0;
				if(op == "event")
				{
					const auto *name = text(field(request, "event"));
					if(!name) return failure("Missing or invalid event");
					if(*name == "pressed") code = LV_EVENT_PRESSED;
					else if(*name == "released") code = LV_EVENT_RELEASED;
					else if(*name == "key")
					{
						code = LV_EVENT_KEY;
						const auto *value = field(request, "key");
						const auto *number = value ? std::get_if<int64_t>(&value->value) : nullptr;
						if(number)
						{
							if(*number < 1 || *number > 127) return failure("ASCII key range");
							key = uint32_t(*number);
						}
						else
						{
							const auto *name = text(value);
							if(!name) return failure("Missing or invalid key");
							if(*name == "right") key = LV_KEY_RIGHT;
							else if(*name == "down") key = LV_KEY_DOWN;
							else if(*name == "enter") key = LV_KEY_ENTER;
							else if(*name == "escape") key = LV_KEY_ESC;
							else if(*name == "backspace") key = LV_KEY_BACKSPACE;
							else return failure("Unknown key");
						}
					}
					else return failure("Unknown event");
				}
				lv_obj_send_event(node, code, code == LV_EVENT_KEY ? &key : nullptr);
			}
			else if(op != "inspect") return failure("Unknown operation");

			sync(); lv_obj_update_layout(project_->root());
			DataValue::Array nodes, views; const auto status = project_->status();
			for(const auto &view:status.views)
				views.emplace_back(DataValue::Object{{"instance", view.instance}, {"pageInstance", view.page_instance},
						{"selected", view.selected}, {"error", view.error}});
			if(list)
			{
				for(const auto &item : *list)
				{
					const auto &id = *text(field(item, "id"));
					auto *node = find_node(item, id);
					DataValue::Object result{{"id", id}, {"found", node != nullptr}};
					if(node)
					{
						lv_area_t area; lv_obj_get_coords(node, &area);
						result["bounds"] = DataValue::Array{area.x1, area.y1, area.x2, area.y2};
						result["state"] = int(lv_obj_get_state(node));
						result["background"] = lv_color_to_u32(lv_obj_get_style_bg_color(node,
						        LV_PART_MAIN)) & 0xffffff;
						result["indicatorColor"] = lv_color_to_u32(lv_obj_get_style_bg_color(node,
						        LV_PART_INDICATOR)) & 0xffffff;
						result["indicatorOpacity"] = lv_obj_get_style_bg_opa(node, LV_PART_INDICATOR);
						if(lv_obj_check_type(node, &lv_label_class)) result["text"] = lv_label_get_text(node);

						if(lv_obj_check_type(node, &lv_arc_class)) result["value"] = lv_arc_get_value(node);

						if(lv_obj_check_type(node, &lv_slider_class)) result["value"] = lv_slider_get_value(node);

						if(lv_obj_check_type(node, &lv_textarea_class)) result["text"] = lv_textarea_get_text(node);

						if(lv_obj_check_type(node, &lv_dropdown_class))
						{
							result["value"] = lv_dropdown_get_selected(node);
							result["open"] = lv_dropdown_is_open(node);
						}
					}

					nodes.emplace_back(std::move(result));
				}
			}

			return DataValue::Object{{"ok", true}, {"nodes", std::move(nodes)}, {"views", std::move(views)},
				{"scheme", appearance_.selected()}, {"dataJson", data_.registry.snapshot_json()},
				{"flushes", display_flush_count()}, {"width", 320}, {"height", 170},
				{"mode", "partial"}, {"buffers", 2}, {"pixelFormat", "RGB565"}, {"transfer", "band"}};
		}

	};
	class Control
	{
		native_view::Pointer &pointer_;
		std::array<uint8_t, 4100> bytes_{}; size_t used_{};
		uint8_t *frame_{};
		size_t frame_offset_{},frame_size_{};
		int64_t frame_progress_{};
		bool capture_pending_{};
		DataValue capture_id_;
		bool write_frame()
		{
			if(!frame_)return true;
			const int count=usb_serial_jtag_write_bytes(frame_+frame_offset_,frame_size_-frame_offset_,0);
			const auto now=esp_timer_get_time();
			if(count>0)
			{
				frame_offset_+=size_t(count);
				frame_progress_=now;
			}
			if(frame_offset_!=frame_size_ && now-frame_progress_<1500000)return false;
			frame_=nullptr;
			display_capture_release();
			return true;
		}
	public:
		explicit Control(native_view::Pointer &pointer) : pointer_(pointer) {}

		void poll(Demo &demo)
		{
			if(!write_frame())return;
			if(capture_pending_)
			{
				if(!display_capture_poll(frame_,frame_size_,demo.capture_scene()))return;
				capture_pending_=false;
				if(!frame_)display_capture_release();
				frame_offset_=0;
				frame_progress_=esp_timer_get_time();
				auto reply=frame_ ? DataValue(DataValue::Object{}) : failure("frame_band_unavailable");
				auto &fields=std::get<DataValue::Object>(reply.value);
				fields["id"]=capture_id_;
				if(frame_){fields["ok"]=true;fields["frameBytes"]=int(frame_size_);}
				emit(reply);
				if(!write_frame())return;
			}
			const int count = usb_serial_jtag_read_bytes(bytes_.data() + used_, bytes_.size() - used_, 0); if(count > 0)
				used_ += size_t(count);

			while(used_ >= 4)
			{
				const size_t size = size_t(bytes_[0]) | (size_t(bytes_[1]) << 8) | (size_t(bytes_[2]) <<
				    16) | (size_t(bytes_[3]) << 24);
				if(!size || size > 4096)
				{
					used_ = 0; emit(DataValue::Object{{"ok", false}, {"error", "Command length 1..4096"}}); return;
				}

				if(used_ < size + 4) return;

				DataValue request;
				std::string error;
                const bool decoded=decode_data_value(bytes_.data()+4,size,request,error,4096);
                const auto *op=decoded ? text(field(request,"op")) : nullptr;
                DataValue result;
                if(op && *op=="frame_band")
                {
                    const auto *yf=field(request,"y"),*hf=field(request,"rows");
                    const auto *y=yf ? std::get_if<int64_t>(&yf->value) : nullptr;
                    const auto *rows=hf ? std::get_if<int64_t>(&hf->value) : nullptr;
                    if(y && rows && *y>=0 && *y<170 && *rows>=1 && *rows<=6 && *rows<=170-*y)
                    {
                        const auto *pf=field(request,"passive");
                        const auto *passive=pf ? std::get_if<bool>(&pf->value) : nullptr;
                        if(!pf || passive)
                            capture_pending_=display_capture_begin(uint16_t(*y),uint16_t(*rows),passive && *passive,demo.capture_scene());
                    }
                    result=failure("frame_band_unavailable");
                }
                else if(op && *op=="view_state")
                {
                    const auto *sf=field(request,"since");
                    const auto *since=sf ? std::get_if<int64_t>(&sf->value) : nullptr;
                    const auto plan=display_bands_since(since && *since>0 && *since<=UINT32_MAX ? uint32_t(*since) : 0);
                    result=DataValue::Object{{"ok", true}, {"scene", plan.scene}, {"damage", plan.revision},
                        {"bands", plan.mask}, {"full", plan.full}};
                }
                else if(op && *op=="view_input")
                {
                    const auto *xf=field(request,"x"),*yf=field(request,"y"),*pf=field(request,"pressed");
                    const auto *x=xf ? std::get_if<int64_t>(&xf->value) : nullptr;
                    const auto *y=yf ? std::get_if<int64_t>(&yf->value) : nullptr;
                    const auto *pressed=pf ? std::get_if<bool>(&pf->value) : nullptr;
                    if(x && y && pressed && *x>=0 && *x<320 && *y>=0 && *y<170 &&
                        pointer_.input(int32_t(*x),int32_t(*y),*pressed))
                        result=DataValue::Object{{"ok", true}};
                    else result=failure("view_input_invalid");
                }
                else
                {
                    result=decoded ? demo.command(request) : failure(error);
                    if(op && *op=="inspect")
                    {
                        auto &fields=std::get<DataValue::Object>(result.value);
                        fields["viewState"]=true;
                        fields["viewBands"]=true;
                        fields["viewInput"]=pointer_.ready();
#if LILYGO_NATIVE_WS
                        fields["wsWifiReason"]=view_network_wifi_reason();
                        if(const auto address=view_network_ipv4())
                        {
                            const esp_ip4_addr_t ip{address};
                            char value[16];
                            std::snprintf(value,sizeof(value),IPSTR,IP2STR(&ip));
                            fields["wsAddress"]=value;
                        }
#endif
                    }
                }
				const auto *id = field(request, "id");
				if(capture_pending_)
				{
					capture_id_=id ? *id : DataValue{};
					used_-=size+4;
					std::memmove(bytes_.data(),bytes_.data()+size+4,used_);
					return;
				}
				std::get<DataValue::Object>(result.value)["id"] = id ? *id : DataValue{};
				emit(result);
				used_ -= size + 4; std::memmove(bytes_.data(), bytes_.data() + size + 4, used_);
				if(!write_frame())return;
			}
		}

	};
}
extern "C" void app_main()
{
	auto *display = initialize_display();
	usb_serial_jtag_driver_config_t serial{8192, 8192};
	if(!usb_serial_jtag_is_driver_installed()) ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&serial));

	usb_serial_jtag_vfs_use_driver(); setvbuf(stdout, nullptr, _IONBF, 0);
	for(const auto pin:{GPIO_NUM_0, GPIO_NUM_14})
	{
		ESP_ERROR_CHECK(gpio_set_direction(pin, GPIO_MODE_INPUT)); ESP_ERROR_CHECK(gpio_pullup_en(pin));
	}
	Demo demo;
	std::string error;
	if(!demo.begin(display, error))
	{
		ESP_LOGE("nacborui", "Startup failed: %s", error.c_str());
		return;
	}
	native_view::Pointer pointer(display);
	Control control(pointer);
#if LILYGO_NATIVE_WS
	start_view_network(pointer.ready());
#endif
	emit(DataValue::Object{{"event", "ready"}, {"target", "T-Display-S3"}, {"lvgl", lv_version_info()},
			{"width", 320}, {"height", 170}, {"mode","partial"}, {"buffers",2}, {"pixelFormat","RGB565"}, {"transfer","band"}});
	int previous[2]{1, 1}; int64_t last_edge[2]{};
	for(;;)
	{
		demo.tick();
		const int64_t now = esp_timer_get_time();
		for(int i = 0; i < 2; i++)
		{
			const int level = gpio_get_level(i ? GPIO_NUM_14 : GPIO_NUM_0);
			if(level != previous[i] && now - last_edge[i] > 50000)
			{
				previous[i] = level; last_edge[i] = now; if(!level)
				{
					if(i)
						demo.next_scheme();
					else
						demo.next_page();
				}
			}
		}
#if LILYGO_NATIVE_WS
		process_view_input(pointer);
#endif
		pointer.tick();
		display_update_scene(demo.capture_scene());
		lv_timer_handler();
		control.poll(demo);
#if LILYGO_NATIVE_WS
		process_view_socket(demo.capture_scene());
#endif
		vTaskDelay(pdMS_TO_TICKS(5));
	}
}
