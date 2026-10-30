#include "application.hpp"
#include "history_plot.hpp"
#include "../../common/sample_image.hpp"
#include <fstream>
#include <array>
#include <stdexcept>
using namespace lvgl_cbor;
namespace {
const DataValue &field(const DataValue &v,const char *name) {
  const auto &object=std::get<DataValue::Object>(v.value);
  auto it=object.find(name);if(it==object.end()) throw std::runtime_error(std::string("Missing ")+name);
  return it->second;
}
std::string text(const DataValue &v) { return std::get<std::string>(v.value); }
const std::array<uint8_t,24*24> sample_pixels=[] {
  std::array<uint8_t,24*24> data{};
  for(size_t y=0;y<24;++y)for(size_t x=0;x<24;++x)data[y*24+x]=((x/6+y/6)%2)?255:40;
  return data;
}();
const lv_image_dsc_t sample_image=[] {
  lv_image_dsc_t image{};image.header.magic=LV_IMAGE_HEADER_MAGIC;image.header.cf=LV_COLOR_FORMAT_A8;
  image.header.w=24;image.header.h=24;image.header.stride=24;
  image.data_size=uint32_t(sample_pixels.size());image.data=sample_pixels.data();return image;
}();
void snapshot(lv_obj_t *root,const std::filesystem::path &path) {
  if(!root)throw std::runtime_error("No project");
  lv_obj_update_layout(root);
  auto *image=lv_snapshot_take(root,LV_COLOR_FORMAT_XRGB8888);
  if(!image)throw std::runtime_error("LVGL snapshot failed");
  const auto width=image->header.w,height=image->header.h;
  std::vector<uint8_t> header(54,0);
  const auto put=[&](size_t at,uint32_t n){for(int i=0;i<4;++i)header[at+i]=uint8_t(n>>(8*i));};
  header[0]='B';header[1]='M';put(2,54+width*height*4);put(10,54);put(14,40);
  put(18,width);put(22,uint32_t(-int32_t(height)));header[26]=1;header[28]=32;
  std::ofstream file(path,std::ios::binary);
  file.write(reinterpret_cast<const char *>(header.data()),header.size());
  for(uint32_t y=0;y<height;++y)file.write(reinterpret_cast<const char *>(image->data+y*image->header.stride),width*4);
  lv_draw_buf_destroy(image);
  if(!file)throw std::runtime_error("Snapshot file write failed");
}
}
Application::Application():metrics(data.registry),resources_(appearance.resources()) {
  if(!history_plot::register_widget(widgets_))throw std::runtime_error("Cannot register history plot");
  resources_.push_back({"montserrat_12","const lv_font_t *",&lv_font_montserrat_12});
  resources_.push_back({"montserrat_14","const lv_font_t *",&lv_font_montserrat_14});
  resources_.push_back({"montserrat_20","const lv_font_t *",&lv_font_montserrat_20});
  resources_.push_back({"montserrat_28","const lv_font_t *",&lv_font_montserrat_28});
  resources_.push_back({"ui_20","const lv_font_t *",fonts_.small()});
  resources_.push_back({"ui_14","const lv_font_t *",fonts_.compact()});
  resources_.push_back({"ui_28","const lv_font_t *",fonts_.large()});
  resources_.push_back({"ui_sample_image","const void *",&sample_image});
  resources_.push_back({"ui_sample_image_small","const void *",&demo_small_image::image});
  std::string error;
  if(!data.registry.add_source({"ui.scheme",DataSchema::object({{"id",DataSchema::text(12)},
       {"title",DataSchema::text(256)}})},error)||
     !data.registry.add_action({"ui.select_scheme",DataSchema::text(12),
       [this](const DataValue &value,std::string &e){return select_scheme(std::get<std::string>(value.value),e);}},error))
    throw std::runtime_error(error);
}
bool Application::select_scheme(const std::string &id,std::string &error) {
  try {
    appearance.select(id);
    for(const auto &choice:appearance.choices())if(choice.id==id)
      return data.registry.publish("ui.scheme",DataValue::Object{{"id",id},{"title",choice.title}},error);
    error="Unknown scheme";return false;
  }catch(const std::exception &e){error=e.what();return false;}
}
void Application::load_schemes(const std::filesystem::path &path,const std::string &initial) {
  load_appearance_file(appearance,path,initial,resources_.data(),resources_.size());
  appearance.install_popup_theme(lv_display_get_default(),fonts_.small());
  std::string error;if(!select_scheme(initial,error))throw std::runtime_error(error);
  data.registry.flush();
}
std::string Application::capabilities() const {
  return runtime_capabilities_json(resources_.data(),resources_.size(),{},&widgets_,&data.registry);
}
void Application::tick() {metrics.drain();data.tick();}
bool Application::load(const std::filesystem::path &path,const std::string &entry,std::string &error) {
  std::ifstream input(path,std::ios::binary|std::ios::ate);
  if(!input) {error="Cannot open project";return false;}
  auto size=input.tellg();if(size<=0||size>std::streamoff(project_limit)) {error="Project size";return false;}
  std::vector<uint8_t> candidate(size_t(size),0);input.seekg(0);
  if(!input.read(reinterpret_cast<char *>(candidate.data()),size)) {error="Cannot read project";return false;}
  // Keep the old service alive through prepare/activation. Failed input preserves it.
  auto source=std::make_unique<ConstProjectSource>(candidate.data(),candidate.size(),
    ProjectStorageInfo{"desktop","opened document",false,false,"available"});
  auto project=std::make_unique<ProjectService>(*source,nullptr,ProjectPolicy{},
    ProjectLimits{project_limit,128},resources_.data(),resources_.size(),&widgets_,std::vector<ProjectStorageInfo>{},&data.registry,ScreenViewport::Display);
  if(!project->begin(error)) return false;
  ScreenReply reply{};
  if(!project->load_screen(entry.empty()?project->status().entry:entry,reply)) {error=reply.error;return false;}
  project_=std::move(project);source_=std::move(source);bytes_=std::move(candidate);
  return true;
}
DataValue Application::command(const DataValue &request) {
  const auto op=text(field(request,"op"));std::string error;
  if(op=="load") {
    if(!load(std::filesystem::u8path(text(field(request,"path"))),text(field(request,"entry")),error)) throw std::runtime_error(error);
  } else if(op=="scheme") {
    if(!select_scheme(text(field(request,"scheme")),error))throw std::runtime_error(error);
    data.registry.flush();
  } else if(op=="snapshot") {
    snapshot(project_?project_->root():nullptr,std::filesystem::u8path(text(field(request,"path"))));
  } else if(op=="publish") {
    if(!data.registry.publish(text(field(request,"source")),field(request,"value"),error)) throw std::runtime_error(error);
    data.registry.flush();
  } else if(op=="invoke") {
    if(!data.registry.invoke(text(field(request,"action")),field(request,"value"),error)) throw std::runtime_error(error);
    data.registry.flush();
  } else if(op=="write") {
    DataPath path;
    const auto &object=std::get<DataValue::Object>(request.value);
    auto p=object.find("path");
    if(p!=object.end()) for(const auto &part:std::get<DataValue::Array>(p->second.value)) {
      if(auto key=std::get_if<std::string>(&part.value)) path.emplace_back(*key);
      else {
        auto index=std::get<int64_t>(part.value);
        if(index<0) throw std::runtime_error("Negative path index");
        path.emplace_back(size_t(index));
      }
    }
    if(!data.registry.write(text(field(request,"source")),path,field(request,"value"),error)) throw std::runtime_error(error);
    data.registry.flush();
  } else if(op=="click"||op=="event") {
    if(!project_) throw std::runtime_error("No project");
    auto &obj=std::get<DataValue::Object>(request.value);
    auto instance=obj.find("instance");
    auto *node=instance==obj.end()?project_->find(text(field(request,"node")).c_str()):
      project_->find(uint32_t(std::get<int64_t>(instance->second.value)),text(field(request,"node")).c_str());
    if(!node) throw std::runtime_error("Unknown node");
    lv_event_code_t code=LV_EVENT_CLICKED;uint32_t key=0;bool dispatch=true;
    if(op=="event") {
      const auto name=text(field(request,"event"));
      if(name=="pressed")code=LV_EVENT_PRESSED;
      else if(name=="released")code=LV_EVENT_RELEASED;
      else if(name=="focus") {
        lv_group_focus_obj(node);dispatch=false;
      }
      else if(name=="key") {
        code=LV_EVENT_KEY;const auto &value=field(request,"key");
        if(auto number=std::get_if<int64_t>(&value.value)) {
          if(*number<1||*number>127)throw std::runtime_error("Test key must be ASCII or a named key");
          key=uint32_t(*number);
        } else {
          const std::map<std::string,uint32_t> keys{{"left",LV_KEY_LEFT},{"right",LV_KEY_RIGHT},
            {"up",LV_KEY_UP},{"down",LV_KEY_DOWN},{"enter",LV_KEY_ENTER},{"escape",LV_KEY_ESC},{"backspace",LV_KEY_BACKSPACE}};
          auto found=keys.find(text(value));if(found==keys.end())throw std::runtime_error("Unknown test key");key=found->second;
        }
      } else throw std::runtime_error("Unknown test event");
    }
    if(dispatch)lv_obj_send_event(node,code,code==LV_EVENT_KEY?&key:nullptr);
    data.registry.flush();
  } else if(op!="inspect") throw std::runtime_error("Unknown player command");
  DataValue::Array views,nodes;
  if(project_) {
    auto status=project_->status();
    for(const auto &v:status.views) views.emplace_back(DataValue::Object{{"instance",v.instance},
      {"pageInstance",v.page_instance},{"node",v.node},{"selected",v.selected},{"error",v.error}});
    auto &object=std::get<DataValue::Object>(request.value);auto list=object.find("nodes");
    if(list!=object.end()) for(const auto &item:std::get<DataValue::Array>(list->second.value)) {
      auto id=text(field(item,"id"));auto &spec=std::get<DataValue::Object>(item.value);auto instance=spec.find("instance");
      auto *node=instance==spec.end()?project_->find(id.c_str()):
        project_->find(uint32_t(std::get<int64_t>(instance->second.value)),id.c_str());
      DataValue::Object result{{"id",id},{"found",node!=nullptr}};
      if(node) {
        lv_obj_update_layout(node);lv_area_t area;lv_obj_get_coords(node,&area);
        result["bounds"]=DataValue::Array{area.x1,area.y1,area.x2,area.y2};
        result["scrollBottom"]=lv_obj_get_scroll_bottom(node);
        result["scrollRight"]=lv_obj_get_scroll_right(node);
        result["fontHeight"]=lv_font_get_line_height(lv_obj_get_style_text_font(node,LV_PART_MAIN));
        if(auto *parent=lv_obj_get_parent(node)) {
          lv_area_t bounds;lv_obj_get_coords(parent,&bounds);
          result["parentBounds"]=DataValue::Array{bounds.x1,bounds.y1,bounds.x2,bounds.y2};
        }
        result["state"]=int(lv_obj_get_state(node));
        result["background"]=lv_color_to_u32(lv_obj_get_style_bg_color(node,LV_PART_MAIN))&0xffffff;
        result["foreground"]=lv_color_to_u32(lv_obj_get_style_text_color(node,LV_PART_MAIN))&0xffffff;
        result["outlineColor"]=lv_color_to_u32(lv_obj_get_style_outline_color(node,LV_PART_MAIN))&0xffffff;
        result["arcColor"]=lv_color_to_u32(lv_obj_get_style_arc_color(node,LV_PART_INDICATOR))&0xffffff;
        result["indicatorOpacity"]=lv_obj_get_style_bg_opa(node,LV_PART_INDICATOR);
        result["indicatorColor"]=lv_color_to_u32(lv_obj_get_style_bg_color(node,LV_PART_INDICATOR))&0xffffff;
        result["indicatorBorder"]=lv_color_to_u32(lv_obj_get_style_border_color(node,LV_PART_INDICATOR))&0xffffff;
        result["knobColor"]=lv_color_to_u32(lv_obj_get_style_bg_color(node,LV_PART_KNOB))&0xffffff;
        result["lineColor"]=lv_color_to_u32(lv_obj_get_style_line_color(node,LV_PART_MAIN))&0xffffff;
        result["indicatorLineColor"]=lv_color_to_u32(lv_obj_get_style_line_color(node,LV_PART_INDICATOR))&0xffffff;
        result["imageRecolor"]=lv_color_to_u32(lv_obj_get_style_image_recolor(node,LV_PART_MAIN))&0xffffff;
        result["cursorBorder"]=lv_color_to_u32(lv_obj_get_style_border_color(node,LV_PART_CURSOR))&0xffffff;
        if(lv_obj_check_type(node,&lv_label_class)) result["text"]=lv_label_get_text(node);
        if(lv_obj_check_type(node,&lv_arc_class)) result["value"]=lv_arc_get_value(node);
        if(lv_obj_check_type(node,&lv_slider_class)) result["value"]=lv_slider_get_value(node);
        if(lv_obj_check_type(node,&lv_bar_class)) result["value"]=lv_bar_get_value(node);
        if(lv_obj_check_type(node,&lv_textarea_class))result["text"]=lv_textarea_get_text(node);
        if(lv_obj_check_type(node,&lv_dropdown_class)) {
          result["value"]=lv_dropdown_get_selected(node);result["open"]=lv_dropdown_is_open(node);
          auto *popup=lv_dropdown_get_list(node);
          result["listBackground"]=lv_color_to_u32(lv_obj_get_style_bg_color(popup,LV_PART_MAIN))&0xffffff;
          lv_area_t popup_area;lv_obj_get_coords(popup,&popup_area);
          result["listBounds"]=DataValue::Array{popup_area.x1,popup_area.y1,popup_area.x2,popup_area.y2};
        }
      }
      nodes.emplace_back(std::move(result));
    }
  }
  return DataValue::Object{{"event","result"},{"op",op},{"ok",true},{"views",std::move(views)},
    {"nodes",std::move(nodes)},{"dataJson",data.registry.snapshot_json()},{"scheme",appearance.selected()}};
}
