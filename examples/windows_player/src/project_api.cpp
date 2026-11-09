// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "project_api.hpp"
#include <filesystem>
#include <fstream>
#include <initializer_list>
#include <limits>
#include <stdexcept>
using namespace lvgl_cbor;
namespace
{
	using Object = DataValue::Object;
	const Object &object(const DataValue &value)
	{
		const auto *result = std::get_if<Object>(&value.value);
		if(!result) throw std::runtime_error("command_object");

		return *result;
	}

	std::string text(const Object &value, const char *name, bool required = true, size_t max = 4096)
	{
		const auto found = value.find(name);
		if(found == value.end())
		{
			if(required) throw std::runtime_error(std::string("Missing ") + name);

			return {};
		}

		const auto *result = std::get_if<std::string>(&found->second.value);
		if(!result || (required && result->empty()) || result->size() > max || result->find('\0') != std::string::npos)
			throw std::runtime_error(std::string("Invalid ") + name);

		return *result;
	}

	void keys(const Object &value, std::initializer_list<const char *> allowed)
	{
		for(const auto &item : value)
		{
			bool accepted = false;
			for(const auto *key : allowed)
				accepted = accepted || item.first == key;
			if(!accepted) throw std::runtime_error("data_command_key");
		}
	}

	DataValue storage(const ProjectStorageInfo &value)
	{
		return Object{{"kind", value.kind}, {"location", value.location}, {"persistent", value.persistent},
			{"writable", value.writable}, {"state", value.state}};
	}

	DataValue names(const std::vector<std::string> &items)
	{
		DataValue::Array result;
		for(const auto &item : items)
			result.emplace_back(item);
		return result;
	}

	std::shared_ptr<const std::vector<uint8_t> > read_packet(const std::filesystem::path &path, size_t max)
	{
		std::ifstream file(path, std::ios::binary | std::ios::ate);
		if(!file) throw std::runtime_error("project_packet_open");

		const auto size = file.tellg();
		if(size <= 0 || size > std::streamoff(max)) throw std::runtime_error("project_size");

		std::vector<uint8_t> bytes(size_t(size), 0);
		file.seekg(0);
		if(!file.read(reinterpret_cast<char *>(bytes.data()), size)) throw std::runtime_error("project_packet_read");

		return std::make_shared<const std::vector<uint8_t> >(std::move(bytes));
	}

	void write_packet(const std::filesystem::path &path, ProjectBytes bytes)
	{
		if(!bytes.data || !bytes.size) throw std::runtime_error("project_packet_empty");

		std::ofstream file(path, std::ios::binary | std::ios::trunc);
		if(!file || !file.write(reinterpret_cast<const char *>(bytes.data), std::streamsize(bytes.size)))
			throw std::runtime_error("project_packet_write");

		file.close();
		if(!file) throw std::runtime_error("project_packet_write");
	}

	Object reply(const std::string &action)
	{
		return Object{{"event", "result"}, {"op", "project"}, {"action", action}, {"ok", true}};
	}

	void show_reply(Object &out, const ScreenReply &result)
	{
		out["saved"] = false;
		out["nodes"] = result.nodes;
		out["methods"] = result.methods;
	}

}

std::string windows_project_status_json(const ProjectStatus &status)
{
	DataValue::Array views, media, documents;
	for(const auto &view : status.views)
		views.emplace_back(Object{{"instance", view.instance}, {"pageInstance", view.page_instance},
				{"node", view.node}, {"selected", view.selected}, {"error", view.error}});
	for(const auto &item : status.media)
		media.push_back(storage(item));
	for(const auto &item : status.documents)
		documents.emplace_back(Object{{"kind", item.kind}, {"name", item.name}, {"origin", item.origin},
				{"location", item.location}, {"bytes", item.bytes}});
	return data_value_json(Object{
		{"format", "lvgl-project-service-1"},
		{"project", Object{{"id", status.id}, {"name", status.name}, {"entry", status.entry},
			 {"revision", status.revision}, {"baseRevision", status.base_revision}, {"changed", status.changed}}},
		{"display", Object{{"screen", status.displayed_screen}, {"revision", status.displayed_revision},
			 {"preview", status.preview}, {"instance", status.root_instance}, {"views", std::move(views)}}},
		{"storage", Object{{"kind", status.storage}, {"persistent", status.persistent}, {"writable", status.writable}}},
		{"policy", Object{{"replace", status.replace}, {"add", status.add}, {"remove", status.remove}}},
		{"base", storage(status.base_storage)},
		{"changes", status.changes_storage.kind.empty() ? DataValue(nullptr) : storage(status.changes_storage)},
		{"media", std::move(media)},
		{"catalog", Object{{"format", status.catalog_format}, {"documents", std::move(documents)}}},
		{"screens", names(status.screens)}, {"styles", names(status.styles)},
		{"maxBytes", status.max_bytes}, {"chunkBytes", 2048}, {"preview", true}});
}

DataValue windows_project_request(ProjectService &project, const DataValue &request, ProjectBytes input,
    std::vector<uint8_t> *output)
{
	const auto &args = object(request);
	const auto action = text(args, "action", true, 32);
	auto out = reply(action);
	std::string error;
	if(action == "info")
	{
		out["projectJson"] = windows_project_status_json(project.status());
	}
	else if(action == "read")
	{
		const auto bytes = encode_project(project.snapshot());
		if(!output) throw std::runtime_error("project_output_required");

		*output = bytes;
		out["revision"] = project.revision();
	}
	else if(action == "screen" || action == "style" || action == "read_screen" || action == "read_style")
	{
		ProjectBytes bytes;
		const auto name = text(args, "name", true, 63);
		const bool ok = action == "screen" || action == "read_screen" ? project.read_screen(name, bytes,
		        error) : project.read_style(name, bytes, error);
		if(!ok) throw std::runtime_error(error);

		if(!output) throw std::runtime_error("project_output_required");

		output->assign(bytes.data, bytes.data + bytes.size);
		out["revision"] = project.revision();
	}
	else if(action == "preview" || action == "save")
	{
		const ProjectBytes bytes = input;
		if(!bytes.data || !bytes.size || bytes.size > project.limits().bytes) throw std::runtime_error("project_size");

		if(action == "preview")
		{
			ScreenReply result{};
			if(!project.preview(bytes, text(args, "screen", true, 63), result)) throw std::runtime_error(result.error);

			show_reply(out, result);
		}
		else
		{
			const auto expected = text(args, "revision", true, 32);
			std::string committed;
			if(!project.save_project(bytes, error, expected, &committed)) throw std::runtime_error(error);

			out["saved"] = true; out["revision"] = committed; out["persistent"] = project.persistent();
		}
	}
	else if(action == "show")
	{
		ScreenReply result{};
		if(!project.load_screen(text(args, "screen", true, 63), result)) throw std::runtime_error(result.error);

		show_reply(out, result);
	}
	else if(action == "refresh")
	{
		ScreenReply result{};
		if(!project.refresh(result)) throw std::runtime_error(result.error);

		show_reply(out, result);
	}
	else if(action == "reset")
	{
		const auto kind = text(args, "kind", false, 16), name = text(args, "name", false, 63);
		const auto expected = text(args, "revision", true, 32);
		std::string committed;
		if(!project.reset(kind, name, error, expected, &committed)) throw std::runtime_error(error);

		out["saved"] = true; out["revision"] = committed; out["persistent"] = project.persistent();
	}
	else throw std::runtime_error("project_action");

	return out;
}

DataValue windows_project_command(ProjectService &project, const DataValue &request)
{
	const auto &args = object(request); const auto action = text(args, "action", true, 32);
	ProjectBytes input; std::shared_ptr<const std::vector<uint8_t> > owner;
	if(action == "save" || action == "preview")
	{
		owner = read_packet(std::filesystem::u8path(text(args, "path")), project.limits().bytes);
		input = {owner->data(), owner->size(), owner};
	}

	std::vector<uint8_t> output; auto reply = windows_project_request(project, request, input, &output);
	if(action == "read" || action == "screen" || action == "style" || action == "read_screen" || action == "read_style")
		write_packet(std::filesystem::u8path(text(args, "path")), {output.data(), output.size(), {}});

	return reply;
}

void windows_data_command(ProjectService *project, DataRegistry &data, const DataValue &request)
{
	const auto &args = object(request);
	const auto kind = text(args, "kind", true, 16);
	std::string error;
	if(kind == "action")
	{
		keys(args, {"kind", "name", "args"});
		const auto value = args.find("args");
		if(!data.invoke(text(args, "name", true, 63), value == args.end() ? DataValue(nullptr) : value->second, error))
			throw std::runtime_error(error);
	}
	else if(kind == "write")
	{
		keys(args, {"kind", "source", "path", "value"});
		const auto value = args.find("value");
		if(value == args.end()) throw std::runtime_error("data_write_parameters");

		DataPath path;
		const auto requested = args.find("path");
		if(requested != args.end())
		{
			const auto *parts = std::get_if<DataValue::Array>(&requested->second.value);
			if(!parts || parts->size() > 8) throw std::runtime_error("data_write_path");

			for(const auto &part : *parts)
			{
				if(const auto *key = std::get_if<std::string>(&part.value))
				{
					if(key->empty() || key->size() > 63) throw std::runtime_error("data_write_path");

					path.emplace_back(*key);
				}
				else if(const auto *index = std::get_if<int64_t>(&part.value))
				{
					if(*index < 0 || *index > 65535) throw std::runtime_error("data_write_path");

					path.emplace_back(size_t(*index));
				}
				else throw std::runtime_error("data_write_path");
			}
		}

		if(!data.write(text(args, "source", true, 63), path, value->second, error)) throw std::runtime_error(error);
	}
	else if(kind == "event")
	{
		keys(args, {"kind", "node", "event", "instance"});
		if(!project) throw std::runtime_error("data_event_target_or_code");

		const auto name = text(args, "node", true, 63), event = text(args, "event", true, 24);
		const auto instance = args.find("instance");
		lv_obj_t *target{};
		if(instance == args.end()) target = project->find(name.c_str());
		else
		{
			const auto *id = std::get_if<int64_t>(&instance->second.value);
			if(!id || *id < 1 || uint64_t(*id) > std::numeric_limits<uint32_t>::max())
				throw std::runtime_error("data_event_instance");

			target = project->find(uint32_t(*id), name.c_str());
		}

		lv_event_code_t code = LV_EVENT_ALL;
		if(event == "clicked") code = LV_EVENT_CLICKED;
		else if(event == "value_changed") code = LV_EVENT_VALUE_CHANGED;
		else if(event == "ready") code = LV_EVENT_READY;
		else if(event == "long_pressed") code = LV_EVENT_LONG_PRESSED;

		if(!target || code == LV_EVENT_ALL) throw std::runtime_error("data_event_target_or_code");

		if(lv_obj_send_event(target, code, nullptr) != LV_RESULT_OK)
			throw std::runtime_error("data_event_deleted_target");
	}
	else throw std::runtime_error("data_command_kind");

	data.flush();
}

void windows_data_command_packet(ProjectService *project, DataRegistry &data, const uint8_t *bytes, size_t size)
{
	DataValue command; std::string error;
	if(!size || size > 4096 || !decode_data_value(bytes, size, command, error, 4096, 12))
		throw std::runtime_error(error.empty() ? "data_command_size" : error);

	windows_data_command(project, data, command);
}

void windows_data_command_file(ProjectService *project, DataRegistry &data, const std::filesystem::path &path)
{
	const auto bytes = read_packet(path, 4096);
	windows_data_command_packet(project, data, bytes->data(), bytes->size());
}
