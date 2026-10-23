#pragma once
#include "drawing.hpp"
namespace lab_widgets::speedometer {
struct State { const char *title="VECTOR / GROUND SPEED",*unit="km/h";int32_t low=0,high=240,value=87,redline=180; };
inline void draw(lv_event_t *event) {
  auto *obj=lv_event_get_target_obj(event);auto &s=state<State>(obj);auto *layer=lv_event_get_layer(event);
  lv_area_t a;lv_obj_get_coords(obj,&a);int w=lv_area_get_width(&a),h=lv_area_get_height(&a);
  const int r=std::max(20,std::min((w-28)/2,(h-58)/2)),cx=a.x1+w/2,cy=a.y1+36+r;
  drawing::text(layer,s.title,a.x1+12,a.y1+10,w-24,muted);
  drawing::arc(layer,cx,cy,r,135,405,0x304652,8);
  const float span=float(std::max<int32_t>(1,s.high-s.low));
  const float warning=std::clamp((s.redline-s.low)/span,0.0f,1.0f);
  drawing::arc(layer,cx,cy,r,135,135+270*warning,green,6);
  drawing::arc(layer,cx,cy,r,135+270*warning,405,red,6);
  for(int i=0;i<=60;++i) {
    const float angle=135+4.5f*i;const bool major=i%5==0;
    drawing::line(layer,drawing::polar(cx,cy,r-12,angle),drawing::polar(cx,cy,r-(major?25:18),angle),major?ink:muted,major?2:1);
    if(major) {char value[20];std::snprintf(value,sizeof(value),"%ld",long(s.low+(s.high-s.low)*i/60));
      auto p=drawing::polar(cx,cy,r-39,angle);drawing::text(layer,value,p.x-22,p.y-7,44,ink,LV_FONT_DEFAULT,LV_TEXT_ALIGN_CENTER);}
  }
  const float angle=135+270*std::clamp((s.value-s.low)/span,0.0f,1.0f);
  auto tip=drawing::polar(cx,cy,r-24,angle),left=drawing::polar(cx,cy,6,angle-90),right=drawing::polar(cx,cy,6,angle+90);
  lv_draw_triangle_dsc_t needle;lv_draw_triangle_dsc_init(&needle);needle.color=color(amber);
  needle.p[0]={lv_value_precise_t(tip.x),lv_value_precise_t(tip.y)};needle.p[1]={lv_value_precise_t(left.x),lv_value_precise_t(left.y)};needle.p[2]={lv_value_precise_t(right.x),lv_value_precise_t(right.y)};lv_draw_triangle(layer,&needle);
  drawing::line(layer,{cx,cy},drawing::polar(cx,cy,19,angle+180),amber,4);
  drawing::circle(layer,cx,cy,10,0x4d6673);drawing::circle(layer,cx,cy,5,ink);
  char value[24];std::snprintf(value,sizeof(value),"%ld",long(s.value));
  drawing::text(layer,value,cx-65,cy+28,130,s.value>=s.redline?red:ink,&lv_font_montserrat_28,LV_TEXT_ALIGN_CENTER);
  drawing::text(layer,s.unit,cx-65,cy+61,130,muted,LV_FONT_DEFAULT,LV_TEXT_ALIGN_CENTER);
}
inline void title(lv_obj_t *obj,const char *value){state<State>(obj).title=value;lv_obj_invalidate(obj);}
inline void range(lv_obj_t *obj,int32_t low,int32_t high){auto &s=state<State>(obj);s.low=low;s.high=high;lv_obj_invalidate(obj);}
inline void reading(lv_obj_t *obj,int32_t value,const char *unit){auto &s=state<State>(obj);s.value=value;s.unit=unit;lv_obj_invalidate(obj);}
inline void redline(lv_obj_t *obj,int32_t value){state<State>(obj).redline=value;lv_obj_invalidate(obj);}
inline lv_obj_t *create(lv_obj_t *parent) {
  auto *obj=frame(parent,340,292);if(!own(obj,new(std::nothrow) State{}))return nullptr;
  lv_obj_add_event_cb(obj,draw,LV_EVENT_DRAW_MAIN,nullptr);return obj;
}
inline bool execute(lv_obj_t *obj,uint16_t method,CborValue &cursor,lvgl_cbor::WidgetContext &context){
 switch(method){
 case 256:return lvgl_cbor::invoke_widget(title,obj,cursor,context);
 case 257:return lvgl_cbor::invoke_widget(range,obj,cursor,context);
 case 258:return lvgl_cbor::invoke_widget(reading,obj,cursor,context);
 case 259:return lvgl_cbor::invoke_widget(redline,obj,cursor,context);
 default:return false;
 }
}
}
