#include "application.hpp"
#include <fstream>
#include <stdexcept>
using namespace lvgl_cbor;
namespace {
const DataValue &field(const DataValue &v,const char *name) {
  const auto &object=std::get<DataValue::Object>(v.value);
  auto it=object.find(name);if(it==object.end()) throw std::runtime_error(std::string("Missing ")+name);
  return it->second;
}
std::string text(const DataValue &v) { return std::get<std::string>(v.value); }
}
std::string Application::capabilities() const {
  return runtime_capabilities_json(resources_,2,{},nullptr,&data.registry);
}
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
    ProjectLimits{project_limit,128},resources_,2,nullptr,std::vector<ProjectStorageInfo>{},&data.registry);
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
  } else if(op=="click") {
    if(!project_) throw std::runtime_error("No project");
    auto &obj=std::get<DataValue::Object>(request.value);
    auto instance=obj.find("instance");
    auto *node=instance==obj.end()?project_->find(text(field(request,"node")).c_str()):
      project_->find(uint32_t(std::get<int64_t>(instance->second.value)),text(field(request,"node")).c_str());
    if(!node) throw std::runtime_error("Unknown node");
    lv_obj_send_event(node,LV_EVENT_CLICKED,nullptr);data.registry.flush();
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
        result["state"]=int(lv_obj_get_state(node));
        if(lv_obj_check_type(node,&lv_label_class)) result["text"]=lv_label_get_text(node);
        if(lv_obj_check_type(node,&lv_arc_class)) result["value"]=lv_arc_get_value(node);
        if(lv_obj_check_type(node,&lv_slider_class)) result["value"]=lv_slider_get_value(node);
      }
      nodes.emplace_back(std::move(result));
    }
  }
  return DataValue::Object{{"event","result"},{"op",op},{"ok",true},{"views",std::move(views)},
    {"nodes",std::move(nodes)},{"dataJson",data.registry.snapshot_json()}};
}
