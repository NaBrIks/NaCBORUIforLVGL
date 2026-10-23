#include "../../examples/s3_style_lab/main/native_widgets/registry.hpp"
#include "../../examples/s3_style_lab/main/native_widgets/signal.hpp"
#include "../../examples/s3_style_lab/main/native_widgets/speedometer.hpp"
#include "../../examples/s3_style_lab/main/native_widgets/radar.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/screen_runtime.hpp"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
#include <set>
static void require(bool ok, const char *why) { if(!ok) {std::fprintf(stderr,"FAILED: %s\n",why);std::exit(1);} }
int main(int argc,char **argv) {
 require(argc==2,"fixture directory");
 lv_init();auto *display=lv_display_create(800,480);
 std::vector<uint8_t> pixels(800*480*2);
 lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
 lv_display_set_buffers(display,pixels.data(),nullptr,pixels.size(),LV_DISPLAY_RENDER_MODE_FULL);
 lv_display_set_flush_cb(display,[](lv_display_t *d,const lv_area_t *,uint8_t *){lv_display_flush_ready(d);});
 const lvgl_cbor::Resource resources[]{{"montserrat_20","const lv_font_t *",&lv_font_montserrat_20},{"montserrat_28","const lv_font_t *",&lv_font_montserrat_28}};
 lvgl_cbor::WidgetRegistry registry;require(lab_widgets::register_examples(registry),"register three native components");
 require(registry.revision()==3,"catalog publication revision");
 require(!lab_widgets::register_examples(registry),"duplicate registration rejected");
 require(registry.revision()==3,"failed registration does not publish a change");
 {std::ofstream out(std::string(argv[1])+"/native-capabilities.json");out<<lvgl_cbor::runtime_capabilities_json(resources,2,{},&registry);}
 std::ifstream file(std::string(argv[1])+"/demo.cbor",std::ios::binary);
 std::vector<uint8_t> packet{std::istreambuf_iterator<char>(file),{}};require(!packet.empty(),"packet");
 auto *original=lv_screen_active();
 {
  lvgl_cbor::ScreenRuntime runtime(resources,2,{},nullptr,lvgl_cbor::ScreenStyleRetention::Release,&registry);
  lvgl_cbor::ScreenReply reply;
  require(runtime.load(packet.data(),packet.size(),reply),reply.error);
  require(reply.nodes==5,"only authoring nodes counted");
  auto &pump=lab_widgets::state<lab_widgets::signal::State>(runtime.find("signal"));
  require(std::string(lv_label_get_text(pump.status))=="RUN","simple scalar handler");
  auto &gauge=lab_widgets::state<lab_widgets::speedometer::State>(runtime.find("speedometer"));
  require(gauge.value==87&&std::string(gauge.unit)=="km/h"&&gauge.high==240,"tuple handler");
  auto &radar=lab_widgets::state<lab_widgets::radar::State>(runtime.find("radar"));
  require(radar.count==4&&std::string(radar.targets[1].name)=="BRAVO"&&radar.targets[1].bearing==122,"nested CBOR cursor");
  require(std::string(radar.targets[3].name)=="DELTA"&&radar.targets[3].strength==45,"cursor reaches last target");
  require(lv_obj_get_width(runtime.find("radar"))==416&&lv_obj_get_y(runtime.find("radar"))==48,"common styles apply to native root");
  lv_refr_now(display);
  auto colors=[&](int x,int y,int w,int h){std::set<uint16_t> unique;for(int row=y;row<y+h;++row)for(int col=x;col<x+w;++col){auto offset=(row*800+col)*2;unique.insert(uint16_t(pixels[offset])|(uint16_t(pixels[offset+1])<<8));}return unique.size();};
  require(colors(16,168,340,292)>12&&colors(368,48,416,412)>12,"native drawing rasterizes scale, needle and radar");
  {std::ofstream raster(std::string(argv[1])+"/native-raster.rgb565",std::ios::binary);raster.write(reinterpret_cast<const char *>(pixels.data()),pixels.size());}
  auto first=pixels;lv_tick_inc(110);lv_timer_handler();lv_refr_now(display);
  require(radar.sweep==48&&pixels!=first,"native timer changes sweep and rendered pixels");
  auto native=registry.find(260);require(native&&native->activate,"registered native activation hook");
  native->activate(runtime.find("radar"),false);auto paused=radar.sweep;
  lv_tick_inc(110);lv_timer_handler();require(radar.sweep==paused,"inactive cached radar pauses its timer");
  lab_widgets::radar::running(runtime.find("radar"),false);
  native->activate(runtime.find("radar"),true);lv_tick_inc(110);lv_timer_handler();
  require(radar.sweep==paused&&!radar.running,"resume preserves explicit stopped state");
  lab_widgets::radar::running(runtime.find("radar"),true);lv_tick_inc(110);lv_timer_handler();
  require(radar.sweep!=paused,"desired running and active owner resume the timer");
  auto retained=registry.find(260);require(registry.remove(260),"runtime removal");
  require(registry.revision()==4,"runtime removal publishes a change");
  require(std::string(radar.targets[0].name)=="ALPHA","live instance survives unregister");
  auto *previous=runtime.root();require(!runtime.load(packet.data(),packet.size(),reply)&&runtime.root()==previous,"unregistered replacement rolls back");
  require(registry.add(*retained),"runtime re-registration");
  for(int i=0;i<100;++i)require(runtime.load(packet.data(),packet.size(),reply),"replace and delete internal tree");
  auto overwritten=packet;packet.assign(packet.size(),0);
  auto &after=lab_widgets::state<lab_widgets::radar::State>(runtime.find("radar"));
  require(std::string(after.targets[1].name)=="BRAVO","text survives input buffer release");
 }
 require(lv_screen_active()==original&&lv_obj_get_child_count(original)==0,"complete native object teardown");
 lv_display_delete(display);lv_deinit();std::puts("Native graphics: rasterized dial/radar, animated pixels, cursor, registration, 100 replacements and timer teardown passed");
}
