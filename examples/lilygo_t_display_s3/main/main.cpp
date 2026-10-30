// SPDX-License-Identifier: MIT
#include "board.hpp"
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
#include <stdexcept>

using namespace lvgl_cbor;
namespace {
const DataValue &field(const DataValue &value,const char *name) {
  const auto &object=std::get<DataValue::Object>(value.value);auto it=object.find(name);
  if(it==object.end())throw std::runtime_error(std::string("Missing ")+name);
  return it->second;
}
std::string text(const DataValue &value){return std::get<std::string>(value.value);}
void emit(const DataValue &value){const auto line=data_value_json(value);printf("@ui %s\n",line.c_str());fflush(stdout);}
class Demo {
  Appearance appearance_;
  DemoData data_;
  std::vector<Resource> resources_;
  ConstProjectSource source_{project_bytes,sizeof(project_bytes),{"rom","compiled demo",true,false,"available"}};
  std::unique_ptr<ProjectService> project_;
public:
  explicit Demo(lv_display_t *display):resources_(appearance_.resources()) {
    resources_.push_back({"montserrat_12","const lv_font_t *",&lv_font_montserrat_12});
    resources_.push_back({"montserrat_14","const lv_font_t *",&lv_font_montserrat_14});
    resources_.push_back({"montserrat_20","const lv_font_t *",&lv_font_montserrat_20});
    resources_.push_back({"montserrat_28","const lv_font_t *",&lv_font_montserrat_28});
    resources_.push_back({"ui_sample_image_small","const void *",&demo_small_image::image});
    appearance_.load({scheme_bytes,sizeof(scheme_bytes),{}},"cream",resources_.data(),resources_.size());
    appearance_.install_popup_theme(display,&lv_font_montserrat_14,2);
    std::string error;
    const auto require=[&](bool ok){if(!ok)throw std::runtime_error(error);};
    require(data_.registry.add_source({"ui.scheme",DataSchema::object({{"id",DataSchema::text(12)},{"title",DataSchema::text(256)}})},error));
    require(data_.registry.add_action({"ui.select_scheme",DataSchema::text(12),[this](const DataValue &value,std::string &e){
      try{appearance_.select(text(value));for(const auto &choice:appearance_.choices())if(choice.id==appearance_.selected())return data_.registry.publish("ui.scheme",DataValue::Object{{"id",choice.id},{"title",choice.title}},e);}
      catch(const std::exception &exception){e=exception.what();}return false;
    }},error));
    require(data_.registry.write("demo.text",{},"Text",error));
    require(data_.registry.invoke("ui.select_scheme","cream",error));
    data_.registry.flush();
    project_=std::make_unique<ProjectService>(source_,nullptr,ProjectPolicy{},ProjectLimits{256*1024,128},resources_.data(),resources_.size(),nullptr,std::vector<ProjectStorageInfo>{},&data_.registry);
    require(project_->begin(error));ScreenReply reply{};
    if(!project_->load_screen("shell",reply))throw std::runtime_error(reply.error);
    sync();
  }
  void sync() {
    data_.registry.flush();
  }
  void tick(){data_.tick();}
  void next_page() {
    const auto status=project_->status();const auto page=status.views.empty()?std::string{}:status.views[0].selected;
    const char *target=page=="home"?"go_controls":page=="controls"?"go_schemes":"go_home";
    lv_obj_send_event(project_->find(target),LV_EVENT_CLICKED,nullptr);sync();
  }
  void next_scheme() {
    const auto &choices=appearance_.choices();size_t index=0;
    for(size_t i=0;i<choices.size();i++)if(choices[i].id==appearance_.selected())index=(i+1)%choices.size();
    std::string error;if(!data_.registry.invoke("ui.select_scheme",choices[index].id,error))throw std::runtime_error(error);sync();
  }
  DataValue command(const DataValue &request) {
    const auto op=text(field(request,"op"));std::string error;
    if(op=="scheme") {if(!data_.registry.invoke("ui.select_scheme",field(request,"scheme"),error))throw std::runtime_error(error);}
    else if(op=="publish"||op=="write") {
      const auto source=text(field(request,"source"));
      const bool ok=op=="publish"?data_.registry.publish(source,field(request,"value"),error):data_.registry.write(source,{},field(request,"value"),error);
      if(!ok)throw std::runtime_error(error);
    } else if(op=="invoke") {if(!data_.registry.invoke(text(field(request,"action")),field(request,"value"),error))throw std::runtime_error(error);}
    else if(op=="click"||op=="event") {
      const auto &object=std::get<DataValue::Object>(request.value);const auto instance=object.find("instance");
      auto *node=instance==object.end()?project_->find(text(field(request,"node")).c_str()):project_->find(uint32_t(std::get<int64_t>(instance->second.value)),text(field(request,"node")).c_str());
      if(!node)throw std::runtime_error("Unknown node");
      lv_event_code_t code=LV_EVENT_CLICKED;uint32_t key=0;
      if(op=="event") {
        const auto name=text(field(request,"event"));
        if(name=="pressed")code=LV_EVENT_PRESSED;else if(name=="released")code=LV_EVENT_RELEASED;
        else if(name=="key") {
          code=LV_EVENT_KEY;const auto &value=field(request,"key");
          if(const auto number=std::get_if<int64_t>(&value.value)) {if(*number<1||*number>127)throw std::runtime_error("ASCII key range");key=uint32_t(*number);}
          else {const auto name=text(value);if(name=="right")key=LV_KEY_RIGHT;else if(name=="down")key=LV_KEY_DOWN;else if(name=="enter")key=LV_KEY_ENTER;else if(name=="escape")key=LV_KEY_ESC;else if(name=="backspace")key=LV_KEY_BACKSPACE;else throw std::runtime_error("Unknown key");}
        } else throw std::runtime_error("Unknown event");
      }
      lv_obj_send_event(node,code,code==LV_EVENT_KEY?&key:nullptr);
    } else if(op!="inspect")throw std::runtime_error("Unknown operation");
    sync();lv_obj_update_layout(project_->root());
    DataValue::Array nodes,views;const auto status=project_->status();
    for(const auto &view:status.views)views.emplace_back(DataValue::Object{{"instance",view.instance},{"pageInstance",view.page_instance},{"selected",view.selected},{"error",view.error}});
    const auto &object=std::get<DataValue::Object>(request.value);const auto requested=object.find("nodes");
    if(requested!=object.end()) {
      const auto &list=std::get<DataValue::Array>(requested->second.value);if(list.size()>32)throw std::runtime_error("Node inspection limit");
      for(const auto &item:list) {
        const auto id=text(field(item,"id"));const auto &spec=std::get<DataValue::Object>(item.value);const auto instance=spec.find("instance");
        auto *node=instance==spec.end()?project_->find(id.c_str()):project_->find(uint32_t(std::get<int64_t>(instance->second.value)),id.c_str());
        DataValue::Object result{{"id",id},{"found",node!=nullptr}};
        if(node) {
          lv_area_t area;lv_obj_get_coords(node,&area);result["bounds"]=DataValue::Array{area.x1,area.y1,area.x2,area.y2};
          result["state"]=int(lv_obj_get_state(node));
          result["background"]=lv_color_to_u32(lv_obj_get_style_bg_color(node,LV_PART_MAIN))&0xffffff;
          result["indicatorColor"]=lv_color_to_u32(lv_obj_get_style_bg_color(node,LV_PART_INDICATOR))&0xffffff;
          result["indicatorOpacity"]=lv_obj_get_style_bg_opa(node,LV_PART_INDICATOR);
          if(lv_obj_check_type(node,&lv_label_class))result["text"]=lv_label_get_text(node);
          if(lv_obj_check_type(node,&lv_arc_class))result["value"]=lv_arc_get_value(node);
          if(lv_obj_check_type(node,&lv_slider_class))result["value"]=lv_slider_get_value(node);
          if(lv_obj_check_type(node,&lv_textarea_class))result["text"]=lv_textarea_get_text(node);
          if(lv_obj_check_type(node,&lv_dropdown_class)){result["value"]=lv_dropdown_get_selected(node);result["open"]=lv_dropdown_is_open(node);}
        }
        nodes.emplace_back(std::move(result));
      }
    }
    return DataValue::Object{{"ok",true},{"nodes",std::move(nodes)},{"views",std::move(views)},
      {"scheme",appearance_.selected()},{"dataJson",data_.registry.snapshot_json()},{"flushes",display_flush_count()},{"width",320},{"height",170}};
  }
};
class Control {
  std::array<uint8_t,4100> bytes_{};size_t used_{};
public:
  void poll(Demo &demo) {
    const int count=usb_serial_jtag_read_bytes(bytes_.data()+used_,bytes_.size()-used_,0);if(count>0)used_+=size_t(count);
    while(used_>=4) {
      const size_t size=size_t(bytes_[0])|(size_t(bytes_[1])<<8)|(size_t(bytes_[2])<<16)|(size_t(bytes_[3])<<24);
      if(!size||size>4096){used_=0;emit(DataValue::Object{{"ok",false},{"error","Command length 1..4096"}});return;}
      if(used_<size+4)return;
      DataValue request,id;std::string error;
      try {
        if(!decode_data_value(bytes_.data()+4,size,request,error,4096))throw std::runtime_error(error);
        const auto &object=std::get<DataValue::Object>(request.value);auto found=object.find("id");if(found!=object.end())id=found->second;
        auto result=demo.command(request);std::get<DataValue::Object>(result.value)["id"]=id;emit(result);
      } catch(const std::exception &exception){emit(DataValue::Object{{"ok",false},{"id",id},{"error",exception.what()}});}
      used_-=size+4;std::memmove(bytes_.data(),bytes_.data()+size+4,used_);
    }
  }
};
}
extern "C" void app_main() {
  try {
    auto *display=initialize_display();
    usb_serial_jtag_driver_config_t serial{8192,8192};
    if(!usb_serial_jtag_is_driver_installed())ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&serial));
    usb_serial_jtag_vfs_use_driver();setvbuf(stdout,nullptr,_IONBF,0);
    for(const auto pin:{GPIO_NUM_0,GPIO_NUM_14}) {ESP_ERROR_CHECK(gpio_set_direction(pin,GPIO_MODE_INPUT));ESP_ERROR_CHECK(gpio_pullup_en(pin));}
    Demo demo(display);Control control;
    emit(DataValue::Object{{"event","ready"},{"target","T-Display-S3"},{"lvgl",lv_version_info()},{"width",320},{"height",170}});
    int previous[2]{1,1};int64_t last_edge[2]{};
    for(;;) {
      demo.tick();control.poll(demo);
      const int64_t now=esp_timer_get_time();
      for(int i=0;i<2;i++) {
        const int level=gpio_get_level(i?GPIO_NUM_14:GPIO_NUM_0);
        if(level!=previous[i]&&now-last_edge[i]>50000) {previous[i]=level;last_edge[i]=now;if(!level){if(i)demo.next_scheme();else demo.next_page();}}
      }
      lv_timer_handler();vTaskDelay(pdMS_TO_TICKS(5));
    }
  }catch(const std::exception &exception){ESP_LOGE("nacborui","Startup failed: %s",exception.what());abort();}
}
