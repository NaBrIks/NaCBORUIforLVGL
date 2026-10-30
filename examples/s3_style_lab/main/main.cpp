// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "board.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "screen_endpoint.hpp"
#include "native_widgets/registry.hpp"
#include "system_status.hpp"
#include "demo_speed.hpp"
#include "data_events.hpp"
#include "lvgl_cbor/screen_contract.hpp"
#include "lvgl_cbor/style_runtime.hpp"
#include "lvgl_cbor/contract.hpp"
#include "lvgl_cbor/data_registry.hpp"
#if LVGL_CBOR_DATA_API
#include "data_api.hpp"
#endif
#if LVGL_CBOR_HAS_PROJECT_SERVICE
#include "project_config.hpp"
#if LVGL_CBOR_PROJECT_API
#include "project_api.hpp"
#endif
#endif
#ifndef LVGL_CBOR_EMBED_EDITOR
#define LVGL_CBOR_EMBED_EDITOR 1
#endif
#if LVGL_CBOR_EMBED_EDITOR
#include "assets.generated.hpp"
#endif
#include "startup.generated.hpp"
#include "cbor.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "esp_random.h"
#include "esp_heap_caps.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include <NaWServer/http_server.h>
#include <NaWServer/backends/tcp.h>
#include <NaWServer/backends/esp_idf_tcp.h>
#include <NaWServer/route.h>
#include <NaWServer/handler_static.h>
#include <NaWServer/websocket.h>
#include <cstdio>
#include <cstring>
#include <string>
#include <memory>
#include <algorithm>
#if __has_include("wifi_secret.hpp")
#include "wifi_secret.hpp"
#else
#define STYLE_LAB_WIFI_SSID ""
#define STYLE_LAB_WIFI_PASSWORD ""
#endif
namespace {
using namespace NaWServer;
// UI packets fit the configured WebSocket frame bound, including reply overhead.
constexpr size_t max_style_packet=3584;
struct Packet{size_t length;uint8_t bytes[max_style_packet];};
StaticQueue_t queue_storage;alignas(4) uint8_t queue_bytes[4*sizeof(Packet)];QueueHandle_t packets;
unsigned received{},applied{};
char boot_id[24]{};
WebSocketEndpoint websocket("/ws");
const lvgl_cbor::Resource resources[]{{"default","const lv_font_t *",LV_FONT_DEFAULT},{"montserrat_20","const lv_font_t *",&lv_font_montserrat_20},{"montserrat_28","const lv_font_t *",&lv_font_montserrat_28}};
lvgl_cbor::StyleService style_service(resources,3);
lvgl_cbor::WidgetRegistry widget_registry;
lvgl_cbor::DataRegistry data_registry;
ScreenEndpoint screen_endpoint(resources,3,&style_service,&widget_registry,&data_registry);
#if LVGL_CBOR_HAS_PROJECT_SERVICE
lvgl_cbor::ProjectService project_service(lab_project::base,&lab_project::changes,lab_project::policy,lab_project::limits,resources,3,&widget_registry,lab_project::media,&data_registry);
#if LVGL_CBOR_PROJECT_API
ProjectApi project_api(project_service);
#endif
#endif
#if LVGL_CBOR_DATA_API
#if LVGL_CBOR_HAS_PROJECT_SERVICE
DataApi data_api(data_registry,[](const char *id){return project_service.find(id);},
 [](uint32_t instance,const char *id){return project_service.find(instance,id);});
#else
DataApi data_api(data_registry,[](const char *id){return screen_endpoint.find(id);},
 [](uint32_t instance,const char *id){return screen_endpoint.find(instance,id);});
#endif
#endif
std::shared_ptr<const std::string> capabilities_snapshot;
size_t capabilities_revision{};
void publish_capabilities(){
 lvgl_cbor::CapabilityLimits limits;limits.style_packet_bytes=max_style_packet;
 limits.screen_websocket_packet_bytes=ScreenEndpoint::max_packet;
 auto body=lvgl_cbor::runtime_capabilities_json(resources,3,limits,&widget_registry,&data_registry);
 body.pop_back();body+=",\"display\":{\"width\":"+std::to_string(lv_display_get_horizontal_resolution(lv_display_get_default()))+",\"height\":"+std::to_string(lv_display_get_vertical_resolution(lv_display_get_default()))+"}}";
#if LVGL_CBOR_HAS_PROJECT_SERVICE && LVGL_CBOR_PROJECT_API
 body.pop_back();body+=",\"project\":{\"format\":\"lvgl-project-service-1\",\"events\":[\"project_changed\"],\"maxBytes\":"+std::to_string(lab_project::limits.bytes)+"}}";
#endif
 std::shared_ptr<const std::string> next=std::make_shared<std::string>(std::move(body));
 std::atomic_store(&capabilities_snapshot,std::move(next));capabilities_revision=widget_registry.revision();
}
std::string quote(const char *s){std::string out="\"";for(;*s;++s){if(*s=='"'||*s=='\\')out+='\\';if(static_cast<unsigned char>(*s)>=32)out+=*s;}return out+'"';}
// Finish JSON construction before entering lwIP: its temporary strings must not share
// the HTTP task's small stack with the send path.
__attribute__((noinline)) std::string info_json(){
 static TaskStatus_t tasks[64];uint32_t runtime;const auto count=uxTaskGetSystemState(tasks,64,&runtime);
 auto *netif=esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");esp_netif_ip_info_t address{};if(netif)esp_netif_get_ip_info(netif,&address);char ip[24];std::snprintf(ip,sizeof(ip),IPSTR,IP2STR(&address.ip));
 std::string body="{\"source\":\"device\",\"board\":\"Waveshare ESP32-S3-Touch-LCD-7 Rev1.2\",\"lvgl\":"+quote((std::to_string(LVGL_VERSION_MAJOR)+"."+std::to_string(LVGL_VERSION_MINOR)+"."+std::to_string(LVGL_VERSION_PATCH)).c_str())+",\"idf\":"+quote(esp_get_idf_version())+",\"ip\":"+quote(ip)+",\"contract_sha256\":"+quote(lvgl_cbor::contract_sha256);
 body+=",\"screen_contract_sha256\":"+quote(lvgl_cbor::screen_contract_sha256)+",\"max_screen_packet\":"+std::to_string(ScreenEndpoint::max_packet)+",\"screen_bindings\":true,\"screen_property_names\":false,\"screen_received\":"+std::to_string(screen_endpoint.received())+",\"screen_applied\":"+std::to_string(screen_endpoint.applied());
 body+=",\"touch_available\":"+std::string(display_touch_available()?"true":"false")+",\"touch_errors\":"+std::to_string(display_touch_errors());
 body+=",\"component_preview\":true,\"component_type\":"+std::to_string(screen_endpoint.component_type());
 body+=",\"embedded_editor\":"+std::string(LVGL_CBOR_EMBED_EDITOR?"true":"false");
 body+=",\"boot_id\":"+quote(boot_id)+",\"reset_reason\":"+std::to_string(esp_reset_reason());
 body+=",\"uptime_ms\":"+std::to_string(esp_timer_get_time()/1000)+",\"heap_free\":"+std::to_string(heap_caps_get_free_size(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT))+",\"psram_free\":"+std::to_string(heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
 body+=",\"max_style_packet\":"+std::to_string(max_style_packet)+",\"resources\":[{\"name\":\"default\",\"type\":\"const lv_font_t *\"},{\"name\":\"montserrat_20\",\"type\":\"const lv_font_t *\"},{\"name\":\"montserrat_28\",\"type\":\"const lv_font_t *\"}]";
#if LVGL_CBOR_HAS_PROJECT_SERVICE
 size_t fs_total{},fs_used{};const bool fs_available=esp_spiffs_info("project",&fs_total,&fs_used)==ESP_OK;
 body+=",\"project_filesystem\":{\"available\":";body+=fs_available?"true":"false";body+=",\"offset\":12582912,\"partition_bytes\":4194304,\"usable_bytes\":";body+=std::to_string(fs_total);body+=",\"used_bytes\":";body+=std::to_string(fs_used);body+='}';
#endif
 body+=",\"received\":"+std::to_string(__atomic_load_n(&received,__ATOMIC_RELAXED))+",\"applied\":"+std::to_string(__atomic_load_n(&applied,__ATOMIC_RELAXED))+",\"tasks\":[";
 const char *states[]{"running","ready","blocked","suspended","deleted","invalid"};
 for(unsigned i=0;i<count;++i){const auto &task=tasks[i];if(i)body+=',';char record[256];std::snprintf(record,sizeof(record),",\"id\":%u,\"core\":%d,\"priority\":%u,\"state\":\"%s\",\"stack_free\":%u}",static_cast<unsigned>(task.xTaskNumber),static_cast<int>(task.xCoreID),static_cast<unsigned>(task.uxCurrentPriority),states[std::min<unsigned>(task.eCurrentState,5)],static_cast<unsigned>(task.usStackHighWaterMark));body+="{\"name\":"+quote(task.pcTaskName)+record;}
 body+="]}";return body;
}
SendResult info(Response &response){
 ESP_LOGI("style_lab","INFO begin");const auto body=info_json();
 (void)response.header("Access-Control-Allow-Origin","*");
 const auto result=response.send(200,"application/json",{reinterpret_cast<const uint8_t*>(body.data()),body.size()});
 ESP_LOGI("style_lab","INFO end: %u",unsigned(result));return result;
}
SendResult capabilities(Response &response){
 (void)response.header("Access-Control-Allow-Origin","*");
 const auto snapshot=std::atomic_load(&capabilities_snapshot);
 return response.send(200,"application/json",{reinterpret_cast<const uint8_t*>(snapshot->data()),snapshot->size()});
}
Route capability_route("/api/capabilities",NaWServer::HttpMethod::Get,capabilities);
Route information("/api/info",NaWServer::HttpMethod::Get,info);
#if LVGL_CBOR_EMBED_EDITOR
class Assets:public HandlerBase{bool canHandle(Request *r)override{for(const auto &asset:assets)if(r->path()==asset.path)return true;return false;}void handleRequest(Request *r,Response &response)override{for(const auto &asset:assets)if(r->path()==asset.path){(void)response.header("Content-Encoding","gzip");(void)response.sendImmutable(200,asset.mime,{asset.data,asset.size});return;}}} asset_handler;
#endif
HandlerBase *const routes[]{&information,&capability_route,&websocket,&screen_endpoint.endpoint(),&screen_endpoint.component_endpoint()
#if LVGL_CBOR_HAS_PROJECT_SERVICE && LVGL_CBOR_PROJECT_API
 ,&project_api
#endif
#if LVGL_CBOR_DATA_API
 ,&data_api
#endif
#if LVGL_CBOR_EMBED_EDITOR
 ,&asset_handler
#endif
};
// The transport and static routes outlive HttpServer. Startup is explicit after
// the application initializes esp_netif; HTTP callbacks stay serialized.
tcp::IdfTransport tcp_transport;
TcpOptions transport_options(){TcpOptions value;value.bind_address="0.0.0.0";value.port=80;return value;}
TcpHttpBackend http_backend(tcp_transport,transport_options());
HttpLimits http_limits(){HttpLimits value;value.max_connections=12;value.max_header_bytes=4096;return value;}
HttpServer server(http_backend,routes,http_limits(),{},ResponseOptions{ContentType::Default,CachePolicy::NoStore,HeaderFlags::NoSniff,ConnectionPolicy::Close});
void wifi_event(void*,esp_event_base_t base,int32_t id,void *data){
 if(base==WIFI_EVENT&&(id==WIFI_EVENT_STA_START||id==WIFI_EVENT_STA_DISCONNECTED)){
  lab_system::network_changed(false);esp_wifi_connect();
 }
 if(base==WIFI_EVENT&&id==WIFI_EVENT_STA_STOP)lab_system::network_changed(false);
 if(base==IP_EVENT&&id==IP_EVENT_STA_GOT_IP){
  const auto *event=static_cast<ip_event_got_ip_t*>(data);
  lab_system::network_changed(true,event->ip_info.ip.addr);
  ESP_LOGI("style_lab","IP: " IPSTR,IP2STR(&event->ip_info.ip));
 }
 if(base==IP_EVENT&&id==IP_EVENT_STA_LOST_IP)lab_system::network_changed(false);
}
void start_network(){
 ESP_ERROR_CHECK(esp_netif_init());ESP_ERROR_CHECK(esp_event_loop_create_default());
 (void)lab_system::begin_time();
 if(!std::strlen(STYLE_LAB_WIFI_SSID)){ESP_LOGW("style_lab","No Wi-Fi credentials: provide ignored main/wifi_secret.hpp");return;}
 esp_netif_create_default_wifi_sta();wifi_init_config_t init=WIFI_INIT_CONFIG_DEFAULT();ESP_ERROR_CHECK(esp_wifi_init(&init));
 ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT,ESP_EVENT_ANY_ID,wifi_event,nullptr));wifi_config_t config{};
 ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT,ESP_EVENT_ANY_ID,wifi_event,nullptr));
 strlcpy(reinterpret_cast<char*>(config.sta.ssid),STYLE_LAB_WIFI_SSID,sizeof(config.sta.ssid));strlcpy(reinterpret_cast<char*>(config.sta.password),STYLE_LAB_WIFI_PASSWORD,sizeof(config.sta.password));
 ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA,&config));ESP_ERROR_CHECK(esp_wifi_start());ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
}
void respond(const lvgl_cbor::Reply &reply,const Packet &packet,lv_obj_t *label){
 static uint8_t buffer[4096];CborEncoder encoder,map;cbor_encoder_init(&encoder,buffer,sizeof(buffer),0);cbor_encoder_create_map(&encoder,&map,9);
 auto key=[&](const char *s){cbor_encode_text_stringz(&map,s);};key("v");cbor_encode_uint(&map,1);key("id");cbor_encode_text_stringz(&map,reply.id);key("ok");cbor_encode_boolean(&map,reply.ok);key("applied");cbor_encode_boolean(&map,reply.ok);key("error");cbor_encode_text_stringz(&map,reply.error);key("methods");cbor_encode_uint(&map,reply.methods);key("contract_sha256");cbor_encode_text_stringz(&map,lvgl_cbor::contract_sha256);
 key("observed");
 if(reply.ok){
  CborEncoder observed;cbor_encoder_create_map(&map,&observed,12);
  auto number=[&](const char *name,int64_t value){cbor_encode_text_stringz(&observed,name);cbor_encode_int(&observed,value);};
  const auto x=lv_obj_get_x(label),y=lv_obj_get_y(label),width=lv_obj_get_width(label),height=lv_obj_get_height(label);
  const auto border=lv_obj_get_style_border_width(label,LV_PART_MAIN);
  number("x",x);number("y",y);number("width",width);number("height",height);
  number("bg_color",lv_color_to_u32(lv_obj_get_style_bg_color(label,LV_PART_MAIN))&0xffffff);
  number("text_color",lv_color_to_u32(lv_obj_get_style_text_color(label,LV_PART_MAIN))&0xffffff);
  number("border_color",lv_color_to_u32(lv_obj_get_style_border_color(label,LV_PART_MAIN))&0xffffff);
  number("border_width",border);number("radius",lv_obj_get_style_radius(label,LV_PART_MAIN));
  number("frame_count",display_frame_count());number("bg_pixel565",display_pixel(x+width/2,y+height/2));number("border_pixel565",display_pixel(x+width/2,y+std::max<int32_t>(0,border/2)));
  cbor_encoder_close_container(&map,&observed);
 }else cbor_encode_null(&map);
 key("echo");cbor_encode_byte_string(&map,packet.bytes,reply.ok?packet.length:0);
 if(cbor_encoder_close_container(&encoder,&map)==CborNoError){const auto result=websocket.send_binary(buffer,cbor_encoder_get_buffer_size(&encoder,buffer));if(result.rejected)ESP_LOGW("style_lab","Reply rejected for %u clients",unsigned(result.rejected));}
}
}
extern "C" void app_main(){
 std::snprintf(boot_id,sizeof(boot_id),"s3-%08lx",static_cast<unsigned long>(esp_random()));
 ESP_ERROR_CHECK(nvs_flash_init());
 packets=xQueueCreateStatic(4,sizeof(Packet),queue_bytes,&queue_storage);ESP_ERROR_CHECK(initialize_display());
 auto *screen=lv_screen_active();lv_obj_set_style_bg_color(screen,lv_color_hex(0x101820),0);
 auto *label=lv_label_create(screen);lv_obj_remove_style_all(label);lv_label_set_text(label,"NaCBORUIforLVGL");
 lvgl_cbor::StyleRuntime styles(label,resources,3,&style_service);lvgl_cbor::Reply initial_reply;
 if(!styles.apply(initial_style_packet,sizeof(initial_style_packet),initial_reply)){ESP_LOGE("style_lab","Initial style rejected: %s",initial_reply.error);abort();}
 websocket.onMessage([](WebSocketClient *client,const uint8_t *data,size_t length,bool binary){
  if(!binary||!length||length>max_style_packet){(void)client->send("binary CBOR, max 3584 bytes");return;}
  auto packet=std::make_unique<Packet>();packet->length=length;std::memcpy(packet->bytes,data,length);
  if(xQueueSend(packets,packet.get(),0)!=pdTRUE){(void)client->send("style queue full");return;}__atomic_fetch_add(&received,1u,__ATOMIC_RELAXED);
 });
 if(!lab_widgets::register_examples(widget_registry)){ESP_LOGE("style_lab","Native widget registration failed");abort();}
 std::string data_error;
 if(!lab_system::register_data(data_registry,data_error)){ESP_LOGE("style_lab","System catalog rejected: %s",data_error.c_str());abort();}
 if(!lab_demo_speed::register_data(data_registry,data_error)){ESP_LOGE("style_lab","Demo catalog rejected: %s",data_error.c_str());abort();}
 data_registry.flush();
 screen_endpoint.begin(screen,&styles);
#if LVGL_CBOR_HAS_PROJECT_SERVICE
 std::string project_error;
 lab_project::mount();
 if(!project_service.begin(project_error)){ESP_LOGE("style_lab","Project rejected: %s",project_error.c_str());abort();}
 lvgl_cbor::ScreenReply project_reply;
 if(!project_service.load_screen("",project_reply)){ESP_LOGE("style_lab","Project screen rejected: %s",project_reply.error);abort();}
#if LVGL_CBOR_PROJECT_API
 project_api.onChanged([](const std::string &revision){
  // The endpoint copies this small invalidation frame into its existing send queue.
  uint8_t buffer[96];CborEncoder encoder,map;cbor_encoder_init(&encoder,buffer,sizeof(buffer),0);cbor_encoder_create_map(&encoder,&map,3);
  cbor_encode_text_stringz(&map,"v");cbor_encode_uint(&map,1);
  cbor_encode_text_stringz(&map,"event");cbor_encode_text_stringz(&map,"project_changed");
  cbor_encode_text_stringz(&map,"revision");cbor_encode_text_string(&map,revision.data(),revision.size());
  if(cbor_encoder_close_container(&encoder,&map)==CborNoError){const auto result=websocket.send_binary(buffer,cbor_encoder_get_buffer_size(&encoder,buffer));if(result.rejected)ESP_LOGW("style_lab","Project notification rejected for %u clients",unsigned(result.rejected));}
 });
 if(!project_api.begin()){ESP_LOGE("style_lab","Project API queue failed");abort();}
#endif
#endif
 publish_capabilities();
 start_network();
 if(!lab_demo_speed::begin(data_error)){ESP_LOGE("style_lab","Demo producer failed: %s",data_error.c_str());abort();}
#if LVGL_CBOR_DATA_API
 if(!data_api.begin()){ESP_LOGE("style_lab","Data API queue failed");abort();}
#endif
 const auto transport_result=tcp_transport.start();
 if(transport_result.status!=tcp::Status::Ok){ESP_LOGE("style_lab","TCP transport start failed: %d",int(transport_result.status));abort();}
 const auto server_result=server.begin();
 if(server_result!=HttpError::Ok){ESP_LOGE("style_lab","HTTP server start failed: %d",int(server_result));(void)tcp_transport.stop();abort();}
 ESP_LOGI("style_lab","TCP HTTP ready; style frame limit %u",unsigned(max_style_packet));
 lab_data::Events data_events(data_registry,{"demo.speed","system.clock","system.network"},[](const uint8_t *bytes,size_t size){return websocket.send_binary(bytes,size).rejected==0;});
 if(!data_events.begin(data_error)){ESP_LOGE("style_lab","Data events failed: %s",data_error.c_str());abort();}
 int64_t previous=esp_timer_get_time();static Packet packet;
 for(;;){if(capabilities_revision!=widget_registry.revision())publish_capabilities();screen_endpoint.process();if(xQueueReceive(packets,&packet,0)==pdTRUE){lvgl_cbor::Reply reply;if(styles.apply(packet.bytes,packet.length,reply)){__atomic_fetch_add(&applied,1u,__ATOMIC_RELAXED);if(lv_screen_active()!=screen)lv_screen_load(screen);lv_obj_update_layout(styles.target());lv_refr_now(nullptr);}respond(reply,packet,styles.target());}
#if LVGL_CBOR_HAS_PROJECT_SERVICE && LVGL_CBOR_PROJECT_API
  project_api.process();
#endif
  lab_system::process();
  lab_demo_speed::process();
#if LVGL_CBOR_DATA_API
  data_api.process();
#endif
  data_registry.flush();
  data_events.process(esp_timer_get_time());
  const auto now=esp_timer_get_time();lv_tick_inc(static_cast<uint32_t>((now-previous)/1000));previous+=((now-previous)/1000)*1000;
  lv_timer_handler();vTaskDelay(pdMS_TO_TICKS(5));}
}

