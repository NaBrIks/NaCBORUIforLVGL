// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "data_api.hpp"
#include "esp_timer.h"
#include <algorithm>
#include <initializer_list>
#include <utility>

namespace
{
	constexpr size_t command_bytes = 4096, queued_commands = 4, retained_results = 8;
	using Value = lvgl_cbor::DataValue;
	using Object = Value::Object;
	std::string quote(const std::string &text)
	{
		return lvgl_cbor::data_value_json(Value(text));
	}

	void json(NaWServer::Response &response, int status, const std::string &body)
	{
		(void)response.send(status, "application/json",
		    {reinterpret_cast<const uint8_t *>(body.data()), body.size()});
	}

	const Value *field(const Object &object, const char *key)
	{
		const auto it = object.find(key);
		return it == object.end() ? nullptr : &it->second;
	}

	bool text(const Object &object, const char *key, std::string &out, size_t max = 63)
	{
		const auto *value = field(object, key);
		const auto *string = value ? std::get_if<std::string>(&value->value) : nullptr;
		if(!string || string->empty() || string->size() > max || string->find('\0') != std::string::npos)
			return false;

		out = *string;
		return true;
	}

	bool keys(const Object &object, std::initializer_list<const char *> allowed)
	{
		for(const auto &entry : object)
			if(std::none_of(allowed.begin(), allowed.end(), [&](const char *key) {
				return entry.first == key;
			}))
				return false;

		return true;
	}

	bool path(const Object &object, lvgl_cbor::DataPath &out)
	{
		const auto *value = field(object, "path");
		if(!value)  return true;

		const auto *items = std::get_if<Value::Array>(&value->value);
		if(!items || items->size() > 8)  return false;

		for(const auto &item : *items)
		{
			if(const auto *key = std::get_if<std::string>(&item.value))
			{
				if(key->empty() || key->size() > 63 || key->find('\0') != std::string::npos)  return false;

				out.emplace_back(*key);
			}
			else if(const auto *index = std::get_if<int64_t>(&item.value))
			{
				if(*index < 0 || uint64_t(*index) > 65535)  return false;

				out.emplace_back(size_t(*index));
			}
			else return false;
		}
		return true;
	}

	lv_event_code_t event_code(const std::string &name)
	{
		if(name == "clicked")  return LV_EVENT_CLICKED;

		if(name == "value_changed")  return LV_EVENT_VALUE_CHANGED;

		if(name == "ready")  return LV_EVENT_READY;

		if(name == "long_pressed")  return LV_EVENT_LONG_PRESSED;

		return LV_EVENT_ALL;
	}

} // namespace

struct DataApi::Command { uint32_t id; std::vector<uint8_t> bytes; };
DataApi::DataApi(lvgl_cbor::DataRegistry &data, Lookup lookup, InstanceLookup instance_lookup)
  : data_(data), lookup_(std::move(lookup)), instance_lookup_(std::move(instance_lookup)),
    snapshot_(std::make_shared<const std::string>("{\"revision\":0,\"sources\":[],\"commands\":[]}"))
{
}

DataApi::~DataApi()
{
	Command *command{};
	if(queue_)
	{
		while(xQueueReceive(queue_, &command, 0) == pdTRUE)
			delete command;
		vQueueDelete(queue_);
	}
}

bool DataApi::begin()
{
	if(!queue_)  queue_ = xQueueCreate(queued_commands, sizeof(Command *));

	if(queue_)  publish_snapshot();

	return queue_ != nullptr;
}

bool DataApi::canHandle(NaWServer::Request *request)
{
	return request->path() == "/api/data";
}

void DataApi::handleRequest(NaWServer::Request *request, NaWServer::Response &response)
{
	(void)response.header("Access-Control-Allow-Origin", "*");
	(void)response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	(void)response.header("Access-Control-Allow-Headers", "Content-Type");
	(void)response.header("Cache-Control", "no-store");
	if(request->method() == NaWServer::HttpMethod::Options) { (void)response.empty(); return; }

	if(request->method() == NaWServer::HttpMethod::Get)
	{
		const auto snapshot = std::atomic_load(&snapshot_);
		json(response, 200, *snapshot);
		return;
	}

	if(request->method() != NaWServer::HttpMethod::Post) { json(response, 405, "{\"error\":\"data_method\"}"); return; }

	const auto body = request->body();
	if(body.empty() || body.size() > command_bytes)
	{
		json(response, 400, "{\"error\":\"data_command_size\"}"); return;
	}

	auto command = std::make_unique<Command>();
	command->id = next_id_.fetch_add(1, std::memory_order_relaxed) + 1;
	command->bytes.assign(body.data(), body.data() + body.size());
	const auto id = command->id;
	// Transfer ownership before publishing the pointer: the UI task may consume
	// and delete it as soon as xQueueSend succeeds.
	auto *queued = command.release();
	if(!queue_ || xQueueSend(queue_, &queued, 0) != pdTRUE)
	{
		delete queued;
		rejected_.fetch_add(1, std::memory_order_relaxed);
		json(response, 503, "{\"error\":\"data_queue_full\"}"); return;
	}

	std::string reply = "{\"queued\":true,\"id\":";
	reply += std::to_string(id); reply += '}';
	json(response, 202, reply);
}

bool DataApi::execute(const Command &command, std::string &error)
{
	using namespace lvgl_cbor;
	DataValue value;
	if(!decode_data_value(command.bytes.data(), command.bytes.size(), value, error, command_bytes, 12))
		return false;

	const auto *object = std::get_if<Object>(&value.value);
	std::string kind, name;
	if(!object || !text(*object, "kind", kind, 16)) { error = "data_command"; return false; }

	if(kind == "action")
	{
		if(!keys(*object, {"kind", "name", "args"}) || !text(*object, "name", name))
		{
			error = "data_action_parameters"; return false;
		}

		const auto *args = field(*object, "args");
		return data_.invoke(name, args ? *args : DataValue{}, error);
	}

	if(kind == "write")
	{
		DataPath target;
		const auto *argument = field(*object, "value");
		if(!keys(*object, {"kind", "source", "path", "value"}) || !text(*object, "source", name) ||
		    !argument || !path(*object, target)) { error = "data_write_parameters"; return false; }

		return data_.write(name, target, *argument, error);
	}

	// Explicit diagnostic operation of this optional adapter, not a binding opcode.
	// It exercises the same LVGL callback as a physical control; it does not claim
	// that the touchscreen or a human tap was tested.
	if(kind == "event")
	{
		std::string event;
		if(!keys(*object, {"kind", "node", "event", "instance"}) || !text(*object, "node", name) ||
		    !text(*object, "event", event, 24)) { error = "data_event_parameters"; return false; }

		uint32_t instance = 0;
		if(const auto *target = field(*object, "instance"))
		{
			const auto *id = std::get_if<int64_t>(&target->value);
			if(!id || *id <= 0 || uint64_t(*id) > UINT32_MAX)
			{
				error = "data_event_instance"; return false;
			}

			instance = static_cast<uint32_t>(*id);
		}

		const auto code = event_code(event);
		auto *object = instance ? (instance_lookup_ ? instance_lookup_(instance, name.c_str()) : nullptr)
		                    : (lookup_ ? lookup_(name.c_str()) : nullptr);
		if(code == LV_EVENT_ALL || !object || !lv_obj_is_valid(object))
		{
			error = "data_event_target_or_code"; return false;
		}

		if(lv_obj_send_event(object, code, nullptr) != LV_RESULT_OK)
		{
			error = "data_event_deleted_target"; return false;
		}

		return true;
	}

	error = "data_command_kind";
	return false;
}

void DataApi::publish_snapshot()
{
	auto body = data_.snapshot_json();
	if(body.empty() || body.back() != '}')  return;

	body.pop_back(); body += ",\"commands\":[";
	bool comma = false;
	for(const auto &result : results_)
	{
		if(comma)  body += ',';

		comma = true;
		body += "{\"id\":"; body += std::to_string(result.id);
		body += ",\"ok\":"; body += result.ok ? "true" : "false";
		body += ",\"error\":"; body += quote(result.error); body += '}';
	}
	body += "],\"queueRejected\":";
	body += std::to_string(rejected_.load(std::memory_order_relaxed)); body += '}';
	std::shared_ptr<const std::string> snapshot = std::make_shared<const std::string>(std::move(body));
	std::atomic_store(&snapshot_, std::move(snapshot));
}

void DataApi::process()
{
	Command *queued{};
	bool changed = false;
	if(queue_ && xQueueReceive(queue_, &queued, 0) == pdTRUE)
	{
		std::unique_ptr<Command> command(queued);
		std::string error;
		const bool ok = execute(*command, error);
		if(results_.size() == retained_results)  results_.pop_front();

		results_.push_back({command->id, ok, std::move(error)});
		changed = true;
	}

	const auto now = esp_timer_get_time();
	if(changed || now >= next_snapshot_) { next_snapshot_ = now + 250000; publish_snapshot(); }
}
