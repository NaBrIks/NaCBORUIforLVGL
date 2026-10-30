#include "demo_data.hpp"
#include <cmath>
#include <ctime>
#include <stdexcept>
using namespace lvgl_cbor;
DemoData::DemoData() {
  using S = DataSchema;
  std::string error;
  const auto require = [&](bool ok) { if(!ok) throw std::runtime_error(error); };
  require(registry.add_source({"demo.speed", S::object({{"kmh", S::number(0,180)},
    {"unit",S::text(8)}, {"sequence",S::integer(0)}})},error));
  require(registry.add_source({"demo.running", S::boolean(),
    [this](const DataPath &, const DataValue &value, std::string &e) {
      running_ = std::get<bool>(value.value);
      return registry.publish("demo.running",running_,e);
    }},error));
  require(registry.add_source({"demo.clicks",S::integer(0)},error));
  require(registry.add_source({"system.clock",S::object({{"localTime",S::text(8)}})},error));
  for(auto source:std::vector<DataSource>{
      {"demo.level",S::integer(0,100)}, {"demo.checked",S::boolean()},
      {"demo.choice",S::integer(0,2)}, {"demo.text",S::text(128)}}) {
    const auto name=source.name;
    source.write=[this,name](const DataPath &,const DataValue &value,std::string &e){return registry.publish(name,value,e);};
    require(registry.add_source(std::move(source),error));
  }
  require(registry.publish("demo.level",65,error));require(registry.publish("demo.checked",true,error));
  require(registry.publish("demo.choice",0,error));require(registry.publish("demo.text","Текст",error));
  require(registry.add_action({"demo.step",S::integer(1,100),
    [this](const DataValue &value,std::string &e) {
      clicks_ += std::get<int64_t>(value.value);
      return registry.publish("demo.clicks",clicks_,e);
    }},error));
  require(registry.add_action({"demo.reset",S::null(),[this](const DataValue &,std::string &e) {
    clicks_=0; return registry.publish("demo.clicks",clicks_,e);
  }},error));
  require(registry.publish("demo.running",true,error));
  require(registry.publish("demo.clicks",0,error));
  tick();
}
void DemoData::tick() {
  const auto now=std::chrono::steady_clock::now();
  if(now < next_) return;
  next_=now+std::chrono::milliseconds(40);
  std::string error;
  if(running_) {
    const double seconds=std::chrono::duration<double>(now-start_).count();
    speed_=90.0*(1.0-std::cos(seconds*0.4));
    // Exercise the same CBOR ingress as an application/transport data adapter.
    const auto bytes=encode_data_value(DataValue::Object{{"kmh",speed_},{"unit","km/h"},{"sequence",++sequence_}});
    if(!registry.publish_cbor("demo.speed",bytes.data(),bytes.size(),error)) throw std::runtime_error(error);
  }
  std::time_t seconds=std::time(nullptr);std::tm local{};
#ifdef _WIN32
  localtime_s(&local,&seconds);
#else
  localtime_r(&seconds,&local);
#endif
  char text[9]{};std::strftime(text,sizeof(text),"%H:%M:%S",&local);
  if(clock_!=text) {
    clock_=text;
    if(!registry.publish("system.clock",DataValue::Object{{"localTime",clock_}},error)) throw std::runtime_error(error);
  }
  registry.flush();
}
