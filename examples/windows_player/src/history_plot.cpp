#include "history_plot.hpp"
#include "history_plot_catalog.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <array>
#include <new>

namespace history_plot {
namespace {
using namespace lvgl_cbor;
struct Series { std::string label; std::array<int,32> history; Series(){history.fill(-1);} };
void draw(lv_event_t *e) {
  auto *obj=lv_event_get_target_obj(e);
  auto &s=*static_cast<Series *>(lv_event_get_user_data(e));
  if(lv_event_get_code(e)==LV_EVENT_DELETE){delete &s;return;}
  lv_area_t area;lv_obj_get_content_coords(obj,&area);
  auto *layer=lv_event_get_layer(e);
  const auto *font=lv_obj_get_style_text_font(obj,LV_PART_MAIN);
  lv_draw_label_dsc_t text;lv_draw_label_dsc_init(&text);
  text.text=s.label.c_str();text.font=font;text.color=lv_obj_get_style_text_color(obj,LV_PART_MAIN);
  text.text_local=1;text.flag=LV_TEXT_FLAG_EXPAND; // Single-line caption, never over the plot.
  lv_area_t title=area;title.y2=title.y1+font->line_height-1;
  lv_draw_label(layer,&text,&title);
  area.y1+=font->line_height+2;
  if(area.y2<=area.y1||area.x2<=area.x1)return;
  lv_draw_line_dsc_t line;lv_draw_line_dsc_init(&line);
  line.color=lv_obj_get_style_border_color(obj,LV_PART_MAIN);line.width=1;
  for(int value:{0,50,100}) {
    const int y=area.y2-(area.y2-area.y1)*value/100;
    line.p1={lv_value_precise_t(area.x1),lv_value_precise_t(y)};
    line.p2={lv_value_precise_t(area.x2),lv_value_precise_t(y)};lv_draw_line(layer,&line);
  }
  line.color=lv_obj_get_style_line_color(obj,LV_PART_INDICATOR);line.width=2;
  for(size_t i=1;i<s.history.size();++i) {
    if(s.history[i-1]<0||s.history[i]<0)continue;
    line.p1={lv_value_precise_t(area.x1+(area.x2-area.x1)*int(i-1)/31),
      lv_value_precise_t(area.y2-(area.y2-area.y1)*s.history[i-1]/100)};
    line.p2={lv_value_precise_t(area.x1+(area.x2-area.x1)*int(i)/31),
      lv_value_precise_t(area.y2-(area.y2-area.y1)*s.history[i]/100)};
    lv_draw_line(layer,&line);
  }
}
lv_obj_t *create(lv_obj_t *parent) {
  auto *obj=lv_obj_create(parent);auto *s=new(std::nothrow) Series;
  if(!s){lv_obj_delete(obj);return nullptr;}
  lv_obj_set_user_data(obj,s);lv_obj_remove_style_all(obj);
  lv_obj_set_scrollable(obj,false);lv_obj_set_clickable(obj,false);
  lv_obj_add_event_cb(obj,draw,LV_EVENT_DRAW_MAIN,s);
  lv_obj_add_event_cb(obj,draw,LV_EVENT_DELETE,s);
  return obj;
}
bool execute(lv_obj_t *obj,uint16_t method,CborValue &cursor,WidgetContext &) {
  if(method!=256)return false;
  // Bounded decode and full validation happen before mutation. No cursor survives.
  if(!cbor_value_is_map(&cursor))return false;
  CborValue value;size_t count;
  if(cbor_value_get_map_length(&cursor,&count)!=CborNoError||count!=2||
     cbor_value_enter_container(&cursor,&value)!=CborNoError)return false;
  Series candidate;bool label=false,history=false;
  for(size_t f=0;f<count;++f) {
    char key[16];size_t capacity=sizeof(key);
    if(cbor_value_copy_text_string(&value,key,&capacity,&value)!=CborNoError)return false;
    if(std::string(key)=="label"&&!label) {
      char text[256];capacity=sizeof(text);
      if(cbor_value_copy_text_string(&value,text,&capacity,&value)!=CborNoError)return false;
      candidate.label=text;label=true;
    } else if(std::string(key)=="history"&&!history) {
      size_t n;CborValue item;
      if(!cbor_value_is_array(&value)||cbor_value_get_array_length(&value,&n)!=CborNoError||n!=32||
         cbor_value_enter_container(&value,&item)!=CborNoError)return false;
      for(auto &sample:candidate.history) {
        int64_t number;
        if(!cbor_value_is_integer(&item)||cbor_value_get_int64_checked(&item,&number)!=CborNoError||number< -1||number>100||
           cbor_value_advance(&item)!=CborNoError)return false;
        sample=int(number);
      }
      if(cbor_value_leave_container(&value,&item)!=CborNoError)return false;
      history=true;
    } else return false;
  }
  if(!label||!history||cbor_value_leave_container(&cursor,&value)!=CborNoError)return false;
  *static_cast<Series *>(lv_obj_get_user_data(obj))=std::move(candidate);lv_obj_invalidate(obj);return true;
}
}
bool register_widget(lvgl_cbor::WidgetRegistry &registry) {
  return registry.add({512,"demo:history_plot","history-1",create,execute,
    history_plot_catalog});
}
}
