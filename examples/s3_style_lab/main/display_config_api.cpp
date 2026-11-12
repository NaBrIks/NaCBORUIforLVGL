// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "display_config_api.hpp"
#include "board.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "response_payload.hpp"
#include "esp_system.h"
#include "esp_timer.h"
#include <NaWServer/request.h>

using namespace NaWServer;
namespace
{
	using Value = lvgl_cbor::DataValue;
	Value config_value(DisplayConfig config)
	{
		return Value::Object{{"mode",config.direct ? "direct" : "full"}, {"buffers",int(config.buffers)}, {"transfer",config.cyclic ? "cyclic" : "dirty"}, {"pixelFormat","RGB565"}, {"rle",config.rle}, {"rleBuffer",config.rle_buffer}};
	}

	uint32_t now_ms() { return uint32_t(esp_timer_get_time()/1000); }
}

RouteDescriptors DisplayConfigApi::routes() const
{
	static const RouteDescriptor entries[]{
		{"/api/display/config",HttpMethod::Get},
		{"/api/display/config",HttpMethod::Post},
		{"/api/display/config",HttpMethod::Options}
	};
	return {entries,3};
}

void DisplayConfigApi::handleRequest(Request *request,Response &response)
{
	using lvgl_cbor::http_payload::json;
	(void)response.header("Access-Control-Allow-Origin","*");
	(void)response.header("Cache-Control","no-store");
	if(request->method()==HttpMethod::Options)
	{
		(void)response.header("Access-Control-Allow-Methods","GET, POST, OPTIONS");
		(void)response.header("Access-Control-Allow-Headers","Content-Type");
		(void)response.text(204,"");
		return;
	}
	if(request->method()==HttpMethod::Get)
	{
		(void)json(response,200,lvgl_cbor::data_value_json(Value::Object{
		    {"active",config_value(display_config())},{"saved",config_value(display_config_saved())},
		    {"rebooting",reboot_at_ms_.load()!=0}, {"dirtyAvailable",display_transfer_available(false)},
		    {"cyclicAvailable",display_transfer_available(true)}}));
		return;
	}
	if(reboot_at_ms_.load())
	{
		(void)json(response,409,"{\"error\":\"display_reboot_pending\"}");
		return;
	}
	const auto body=request->body();
	const auto content_type=request->header("Content-Type");
	Value value;
	std::string error;
	const auto decoded=content_type && *content_type=="application/cbor" && body.size()<=128 &&
	    lvgl_cbor::decode_data_value(body.data(),body.size(),value,error,128,2);
	const auto *object=decoded ? std::get_if<Value::Object>(&value.value) : nullptr;
	const std::string *mode=nullptr;
	const int64_t *buffers=nullptr;
	const std::string *transfer=nullptr;
	const bool *rle=nullptr,*rle_buffer=nullptr;
	bool fields_valid=true;
	if(object && object->count("mode") && object->count("buffers"))
	{
		mode=std::get_if<std::string>(&object->at("mode").value);
		buffers=std::get_if<int64_t>(&object->at("buffers").value);
		if(object->count("transfer"))
		{
			transfer=std::get_if<std::string>(&object->at("transfer").value);
			fields_valid=transfer && (*transfer=="dirty" || *transfer=="cyclic");
		}
		if(object->count("rle")) rle=std::get_if<bool>(&object->at("rle").value);
		if(object->count("rleBuffer")) rle_buffer=std::get_if<bool>(&object->at("rleBuffer").value);
		fields_valid=fields_valid && object->size()==size_t(2+(transfer!=nullptr)+(rle!=nullptr)+(rle_buffer!=nullptr));
	}
	if(!fields_valid || !mode || (*mode!="full" && *mode!="direct") || !buffers || *buffers<1 || *buffers>2)
	{
		(void)json(response,400,"{\"error\":\"display_config_invalid\"}");
		return;
	}
	const auto saved=display_config_saved();
	const DisplayConfig config{*mode=="direct",uint8_t(*buffers),transfer ? *transfer=="cyclic" : saved.cyclic,
	    rle ? *rle : saved.rle,rle_buffer ? *rle_buffer : saved.rle_buffer};
	if(!display_transfer_available(config.cyclic))
	{
		(void)json(response,400,"{\"error\":\"display_transfer_unavailable\"}");
		return;
	}
	if(!persist_and_restart(config,error))
	{
		(void)json(response,error=="display_reboot_pending" ? 409 : 500,
		    lvgl_cbor::data_value_json(Value::Object{{"error",error}}));
		return;
	}
	(void)json(response,202,"{\"ok\":true,\"rebooting\":true}");
}

bool DisplayConfigApi::persist_and_restart(DisplayConfig config, std::string &error)
{
	std::lock_guard<std::mutex> lock(save_mutex_);
	if(reboot_at_ms_.load()) {error="display_reboot_pending";return false;}
	if(display_config_save(config)!=ESP_OK) {error="display_config_save_failed";return false;}
	const auto deadline=now_ms()+1200;
	reboot_at_ms_.store(deadline ? deadline : 1);
	return true;
}

bool DisplayConfigApi::publish(std::string &error)
{
	const auto active=display_config();
	const auto mode=[](DisplayConfig config){return config.direct ? "DIRECT" : "FULL";};
	const auto summary=[&](DisplayConfig config){return std::string(mode(config))+" / "+std::to_string(config.buffers)+" / RGB565 / "+(config.cyclic ? "Cyclic" : "Dirty")+" / "+(config.rle ? (config.rle_buffer ? "RLE auto" : "RLE stream") : "RAW");};
	return registry_->publish("ui.display_config",Value::Object{
	    {"active",summary(active)}, {"draft",summary(draft_)},
	    {"mode",mode(draft_)}, {"buffers",int(draft_.buffers)}, {"transfer",draft_.cyclic ? "cyclic" : "dirty"},
	    {"changed",active.direct!=draft_.direct || active.buffers!=draft_.buffers || active.cyclic!=draft_.cyclic || active.rle!=draft_.rle || active.rle_buffer!=draft_.rle_buffer},
	    {"rebooting",reboot_at_ms_.load()!=0}},error);
}

bool DisplayConfigApi::install(lvgl_cbor::DataRegistry &registry, std::string &error)
{
	using lvgl_cbor::DataSchema;
	registry_=&registry;
	draft_=display_config_saved();
	if(!registry.add_source({"ui.display_config",DataSchema::object({
	    {"active",DataSchema::text(64)},{"draft",DataSchema::text(64)}, {"mode",DataSchema::text(6)},
	    {"buffers",DataSchema::integer(1,2)},{"transfer",DataSchema::text(6)},{"changed",DataSchema::boolean()},{"rebooting",DataSchema::boolean()}}),
	    {},"Display configuration","Active boot settings and the local Setup draft","ui"},error))return false;
	if(!registry.add_action({"ui.display_mode",DataSchema::text(6),[this](const Value &value,std::string &failure){
	    const auto &mode=std::get<std::string>(value.value);
	    if(mode!="FULL" && mode!="DIRECT") {failure="display_config_invalid";return false;}
	    draft_.direct=mode=="DIRECT";
	    return publish(failure);
	},"Display render mode","Select FULL or DIRECT in the draft","ui"},error))return false;
	if(!registry.add_action({"ui.display_buffers",DataSchema::integer(1,2),[this](const Value &value,std::string &failure){
	    draft_.buffers=uint8_t(std::get<int64_t>(value.value));
	    return publish(failure);
	},"Display buffers","Select one or two framebuffers in the draft","ui"},error))return false;
	if(!registry.add_action({"ui.display_transfer",DataSchema::text(6),[this](const Value &value,std::string &failure){
	    const auto &transfer=std::get<std::string>(value.value);
	    if(transfer!="dirty" && transfer!="cyclic") {failure="display_config_invalid";return false;}
	    if(!display_transfer_available(transfer=="cyclic")) {failure="display_transfer_unavailable";return false;}
	    draft_.cyclic=transfer=="cyclic";
	    return publish(failure);
	},"Frame transfer","Select dirty or cyclic in the draft","ui"},error))return false;
	if(!registry.add_action({"ui.display_restart",DataSchema::null(),[this](const Value &,std::string &failure){
	    if(!persist_and_restart(draft_,failure))return false;
	    return publish(failure);
	},"Save display settings and restart","Persist the Setup draft and reboot","ui"},error))return false;
	return publish(error);
}

void DisplayConfigApi::process()
{
	const auto deadline=reboot_at_ms_.load();
	if(deadline && int32_t(now_ms()-deadline)>=0) esp_restart();
}
