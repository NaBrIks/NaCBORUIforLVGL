#include "appearance.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <fstream>
#include <stdexcept>
using namespace lvgl_cbor;
Appearance::Appearance():roles_{"canvas","panel","status","text","muted","button",
  "button_pressed","button_focus","button_disabled","indicator","track","knob","arc_track","arc_value"} {
  for(const auto &role:roles_)active_.emplace("ui."+role,std::make_shared<StyleValue>());
}
std::vector<Resource> Appearance::resources() const {
  std::vector<Resource> result;
  for(const auto &item:active_)result.push_back({item.first.c_str(),"const lv_style_t *",&item.second->value});
  return result;
}
void Appearance::load(const std::filesystem::path &path,const std::string &initial,const Resource *resources,size_t count) {
  std::ifstream file(path,std::ios::binary|std::ios::ate);
  const auto size=file?file.tellg():std::streampos(-1);
  if(size<=0||size>256*1024)throw std::runtime_error("Appearance file size");
  auto bytes=std::make_shared<std::vector<uint8_t>>(size_t(size));file.seekg(0);
  if(!file.read(reinterpret_cast<char *>(bytes->data()),size))throw std::runtime_error("Appearance file read");
  ProjectBundle bundle;std::string error;
  if(!parse_project({bytes->data(),bytes->size(),bytes},bundle,error,{256*1024,128})||bundle.id!="windows-schemes")throw std::runtime_error("Appearance project: "+error);
  // Prepare all variants using the existing style executor before replacing any live style.
  StyleService prepared(resources,count,128);StyleRuntime compiler(nullptr,resources,count,&prepared);
  for(const auto &style:bundle.styles) {
    Reply reply{};
    if(!compiler.apply(style.bytes.data,style.bytes.size,reply))throw std::runtime_error(std::string("Appearance style: ")+reply.error);
  }
  std::vector<Choice> choices;
  if(bundle.screens.empty()||bundle.screens.size()>8)throw std::runtime_error("Appearance choice count");
  for(const auto &screen:bundle.screens) {
    DataValue metadata;
    if(!decode_data_value(screen.bytes.data,screen.bytes.size,metadata,error,32768))throw std::runtime_error(error);
    auto &object=std::get<DataValue::Object>(metadata.value);
    Choice choice{screen.name,std::get<std::string>(object.at("title").value),{}};
    for(const auto &role:roles_) {
      auto handle=prepared.resolve("global-dynamic:"+choice.id+"."+role);
      if(!handle)throw std::runtime_error("Missing appearance role: "+role);
      choice.styles.push_back(std::move(handle));
    }
    choices.push_back(std::move(choice));
  }
  bool found=false;for(const auto &choice:choices)found|=choice.id==initial;
  if(!found)throw std::runtime_error("Unknown initial scheme: "+initial);
  choices_=std::move(choices);selected_.clear();select(initial);
}
void Appearance::select(const std::string &id) {
  const Choice *choice=nullptr;
  for(const auto &candidate:choices_)if(candidate.id==id){choice=&candidate;break;}
  if(!choice)throw std::runtime_error("Unknown scheme: "+id);
  if(selected_==id)return;
  // Serialized UI context: no frame can render a half-applied palette. No object is recreated.
  for(size_t i=0;i<roles_.size();++i)active_.at("ui."+roles_[i])->replace(*choice->styles[i].owner);
  selected_=id;
}
