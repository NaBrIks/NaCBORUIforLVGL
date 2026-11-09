// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "host_agent.hpp"
#include <stdexcept>
#include <algorithm>
#include <array>
using namespace lvgl_cbor;
using O = DataValue::Object;
using S = DataSchema;
namespace
{
	constexpr size_t image_encoded_limit = 128 * 1024;
	constexpr size_t image_decoded_limit = 96 * 1024;
	constexpr size_t images_encoded_limit = 512 * 1024;

	int base64_digit(unsigned char c)
	{
		if(c >= 'A' && c <= 'Z') return c - 'A';

		if(c >= 'a' && c <= 'z') return c - 'a' + 26;

		if(c >= '0' && c <= '9') return c - '0' + 52;

		if(c == '+') return 62;

		if(c == '/') return 63;

		return -1;
	}

	bool valid_image(const std::string &text, const std::string &mime)
	{
		if(text.empty() || text.size() % 4 || text.size() > image_encoded_limit) return false;

		std::array<unsigned char, 12> header{};
		size_t decoded = 0;
		for(size_t i = 0; i < text.size(); i += 4)
		{
			const int a = base64_digit(text[i]), b = base64_digit(text[i + 1]);
			const bool pad_c = text[i + 2] == '=', pad_d = text[i + 3] == '=';
			const int c = pad_c ? 0 : base64_digit(text[i + 2]);
			const int d = pad_d ? 0 : base64_digit(text[i + 3]);
			if(a < 0 || b < 0 || c < 0 || d < 0 || (pad_c && !pad_d) ||
			    ((pad_c || pad_d) && i + 4 != text.size()) ||
			    (pad_c && (b & 15)) || (pad_d && !pad_c && (c & 3))) return false;

			const unsigned value = (unsigned(a) << 18) | (unsigned(b) << 12) | (unsigned(c) << 6) | unsigned(d);
			const size_t count = pad_c ? 1 : pad_d ? 2 : 3;
			for(size_t n = 0; n < count; ++n)
			{
				if(decoded < header.size()) header[decoded] = static_cast<unsigned char>(value >> (16 - 8 * n));

				++decoded;
			}
		}
		if(decoded > image_decoded_limit) return false;

		if(mime == "application/json") return decoded > 1 && decoded <= 65536;

		if(mime == "image/png")
		{
			const std::array<unsigned char, 8> png{{137, 80, 78, 71, 13, 10, 26, 10}};
			return decoded >= png.size() && std::equal(png.begin(), png.end(), header.begin());
		}

		if(mime == "image/jpeg") return decoded >= 3 && header[0] == 255 && header[1] == 216 && header[2] == 255;

		return mime == "image/webp" && decoded >= 12 && header[0] == 'R' && header[1] == 'I' &&
		       header[2] == 'F' && header[3] == 'F' && header[8] == 'W' && header[9] == 'E' &&
		       header[10] == 'B' && header[11] == 'P';
	}

}

bool HostAgent::image_action(const std::string &kind, const DataValue &value, std::string &error)
{
	const auto fail = [&](const char *message){
			error = message; return false;
		};
	if(!pending_prompts_.empty()) return fail("Image attachments are locked while a prompt is pending");

	if(kind == "images_clear")
	{
		std::vector<ImageUpload>().swap(images_);
		return true;
	}

	const auto &fields = std::get<O>(value.value);
	const auto id_field = fields.find("id");
	if(id_field == fields.end()) return fail("Image id is required");

	const auto &id = std::get<std::string>(id_field->second.value);
	if(id.empty()) return fail("Image id is empty");

	auto found = std::find_if(images_.begin(), images_.end(), [&](const ImageUpload &image){
		return image.id == id;
	});
	if(kind == "image_begin")
	{
		if(found != images_.end()) return fail("Image id already exists");

		if(images_.size() >= 4) return fail("At most four image attachments are allowed");

		const auto name = fields.find("name"), mime = fields.find("mime"), size = fields.find("size");
		if(name == fields.end() || mime == fields.end() || size == fields.end())
			return fail("Image name, mime and size are required");

		const auto &type = std::get<std::string>(mime->second.value);
		if(type != "image/png" && type != "image/jpeg" && type != "image/webp" && type != "application/json")
			return fail("Only PNG, JPEG, WebP and JSON attachments are supported");

		const auto expected = size_t(std::get<int64_t>(size->second.value));
		if(!expected || expected % 4 || expected > image_encoded_limit) return fail("Invalid base64 image size");

		size_t total = expected;
		for(const auto &image:images_)
			total += image.expected;
		if(total > images_encoded_limit) return fail("Image attachment total size exceeded");

		ImageUpload image{id, std::get<std::string>(name->second.value), type, {}, expected, false};
		image.data.reserve(expected);
		images_.push_back(std::move(image));
		return true;
	}

	if(found == images_.end()) return fail("Unknown image id");

	if(found->ready) return fail("Image has already been committed");

	if(kind == "image_chunk")
	{
		const auto offset = fields.find("offset"), data = fields.find("data");
		if(offset == fields.end() || data == fields.end()) return fail("Image offset and data are required");

		const auto &chunk = std::get<std::string>(data->second.value);
		if(size_t(std::get<int64_t>(offset->second.value)) != found->data.size())
			return fail("Image chunk offset is out of order");

		if(chunk.empty() || chunk.size() > found->expected - found->data.size())
			return fail("Image chunk size exceeds the declared image size");

		for(size_t n = 0; n < chunk.size(); ++n)
			if(base64_digit(chunk[n]) < 0 &&
			    (chunk[n] != '=' || found->data.size() + n < found->expected - 2))
				return fail("Invalid base64 image character or padding position");

		found->data += chunk;
		return true;
	}

	if(found->data.size() != found->expected) return fail("Image upload is incomplete");

	if(!valid_image(found->data, found->mime)) return fail("Invalid image base64, size or MIME signature");

	found->ready = true;
	return true;
}

void HostAgent::publish(const char *name, DataValue value)
{
	std::string error; if(!registry_.publish(name, std::move(value), error)) throw std::runtime_error(error);
}

HostAgent::HostAgent(DataRegistry &registry, std::function<std::string()> key_input)
  : registry_(registry), key_input_(std::move(key_input))
{
	std::string e;
	const auto need = [&](bool ok){
			if(!ok)
				throw std::runtime_error(e);
		};
	need(registry_.add_group({"assistant", "UI assistant",
	                          "Bounded model/tool execution through the existing MCP adapter", ""}, e));
	for(const auto &item:std::vector<std::pair<std::string, size_t> >{{"endpoint", 512}, {"model", 128},
			{"prompt", 3500}, {"model_filter", 128}})
	{
		const auto name = "assistant." + item.first;
		need(registry_.add_source({name, S::text(item.second),
		                           [this, name](const DataPath &, const DataValue &v, std::string &error){
									   if(name == "assistant.model_filter")
									   {
										   const auto *old = registry_.read(name);
										   if((!old ||
										   std::get<std::string>(old->value) != std::get<std::string>(v.value)) &&
										   !registry_.publish("assistant.model_offset", 0, error)) return false;
									   }

									   return registry_.publish(name, v, error);
								   }, item.first, "Application-owned assistant input", "assistant"}, e));
		publish(name.c_str(), item.first == "endpoint" ? DataValue("https://openrouter.ai/api/v1") :
		    item.first == "model" ? DataValue("qwen/qwen3.8-27b:free") : DataValue(""));
	}
	for(const auto &item:std::vector<std::pair<std::string, size_t> >{{"status", 512}, {"reply", 4096},
			{"models", 4096}})
	{
		need(registry_.add_source({"assistant." + item.first, S::text(item.second), {}, item.first,
		                           "Assistant result; secrets are never published", "assistant"}, e));
		publish(("assistant." + item.first).c_str(), "");
	}
	need(registry_.add_source({"assistant.log", S::array(S::object({{"seq", S::integer()},
								   {"elapsed_ms", S::integer()}, {"kind", S::text(16)}, {"text", S::text(1024)}}), 48),
							   {}, "Assistant execution log",
	                           "Bounded ephemeral execution trace without secrets or image data", "assistant"}, e));
	publish("assistant.log", DataValue::Array{});
	need(registry_.add_source({"assistant.free_only", S::boolean(),
	                           [this](const DataPath &, const DataValue &v, std::string &error){
								   const auto *old = registry_.read("assistant.free_only");
								   if((!old || std::get<bool>(old->value) != std::get<bool>(v.value)) &&
								   !registry_.publish("assistant.model_offset", 0, error)) return false;

								   return registry_.publish("assistant.free_only", v, error);
							   }, "Free models only", "Only models with confirmed zero token pricing", "assistant"},
	    e));
	publish("assistant.free_only", true);
	need(registry_.add_source({"assistant.model_catalog", S::array(S::object({{"id", S::text(128)},
								   {"title", S::text(128)}, {"free", S::boolean()}}), 64), {}, "Filtered model catalog",
	                           "Bounded model metadata in the same order as the native selector", "assistant"}, e));
	publish("assistant.model_catalog", DataValue::Array{});
	need(registry_.add_source({"assistant.model_offset", S::integer(0, 4095),
	                           [this](const DataPath &, const DataValue &v, std::string &error){
								   return registry_.publish("assistant.model_offset", v, error);
							   }, "Model page offset", "Ephemeral offset in the full filtered catalog", "assistant"},
	    e));
	publish("assistant.model_offset", 0);
	need(registry_.add_source({"assistant.model_page", S::object({{"offset", S::integer(0, 4095)},
								   {"total", S::integer(0, 4096)}, {"shown", S::integer(0, 64)}}), {}, "Model page",
	                           "Actual offset, matching total and shown rows after byte limits", "assistant"}, e));
	publish("assistant.model_page", O{{"offset", 0}, {"total", 0}, {"shown", 0}});

	for(const char *field:{"key_present", "busy"})
	{
		need(registry_.add_source({std::string("assistant.") + field, S::boolean(), {}, field, "Assistant state",
		                           "assistant"}, e));
		publish((std::string("assistant.") + field).c_str(), false);
	}
	need(registry_.add_source({"assistant.model_index", S::integer(0, 63),
	                           [this](const DataPath &, const DataValue &v, std::string &error){
								   const auto i = size_t(std::get<int64_t>(v.value)); if(i >= models_.size())
								   {
									   error = "Model index"; return false;
								   }

								   if(!registry_.publish("assistant.model", models_[i], error)) return false;

								   return registry_.publish("assistant.model_index", v, error);
							   }, "Model selection", "Index into the bounded returned model list", "assistant"}, e));
	publish("assistant.model_index", 0);
	need(registry_.add_source({"assistant.generation", S::integer(), {}, "Completion generation",
	                           "Changes after every completed host request", "assistant"}, e));
	publish("assistant.generation", 0);
	need(registry_.add_source({"assistant.completion", S::object({{"generation", S::integer()}, {"ok", S::boolean()}}),
							   {}, "Completion", "Atomic result of the latest host operation", "assistant"}, e));
	publish("assistant.completion", O{{"generation", 0}, {"ok", false}});
	need(registry_.add_source({"assistant.chat", S::object({{"id", S::text(36)},
								   {"total", S::integer()}, {"offset", S::integer()}, {"nextOffset", S::integer()},
								   {"messages", S::array(S::object({{"id", S::integer()}, {"role", S::text(16)},
										{"text", S::text(4096)}, {"files", S::text(1024)}}), 8)}}), {},
	                           "Conversation", "Bounded transcript page; attachment contents remain on the host",
	                           "assistant"}, e));
	publish("assistant.chat",
	    O{{"id", ""}, {"total", 0}, {"offset", 0}, {"nextOffset", -1}, {"messages", DataValue::Array{}}});
	need(registry_.add_action({"assistant.key", S::text(2048), [this](const DataValue &v, std::string &error){
								   const auto &text = std::get<std::string>(v.value);
								   return submit("configure",
								          O{{"key", text.empty() && key_input_ ? key_input_() : text}}, error);
							   }, "Store API key",
	                           "Secret goes directly to the private host pipe, never to a source/project", "assistant"},
	    e));
	for(const auto &pair:std::vector<std::pair<std::string, std::string> >{{"save", "configure"},
			{"list_models", "models"}, {"send", "prompt"}, {"cancel", "cancel"}, {"new_chat", "new_chat"}})
	{
		need(registry_.add_action({"assistant." + pair.first, S::boolean(),
		                           [this, kind = pair.second](const DataValue &value, std::string &error){
									   return submit(kind, kind == "models" ? O{{"refresh", value}} : O{}, error);
								   }, pair.first, "Host assistant operation", "assistant"}, e));
	}
	need(registry_.add_action({"assistant.chat_page", S::integer(0, 1000000),
	                           [this](const DataValue &value, std::string &error){
								   return submit("chat_page", O{{"offset", value}}, error);
							   },
	                           "Conversation page", "Read a transcript page from host memory", "assistant"}, e));
	for(const auto &entry:std::vector<std::pair<std::string, S> >{
		{"images_clear", S::boolean()},
		{"image_begin", S::object({{"id", S::text(63)}, {"name", S::text(128)},
			 {"mime", S::text(32)}, {"size", S::integer(1, 131072)}})},
		{"image_chunk", S::object({{"id", S::text(63)}, {"offset", S::integer(0, 131072)},
			 {"data", S::text(2048)}})},
		{"image_commit", S::object({{"id", S::text(63)}})}})
	{
		need(registry_.add_action({"assistant." + entry.first, entry.second,
		                           [this, kind = entry.first](const DataValue &value, std::string &error){
									   return image_action(kind, value, error);
								   }, entry.first, "Private bounded image attachment upload; base64 is never published",
		                           "assistant"}, e));
	}
	std::string ignored; submit("load", O{}, ignored);
}

bool HostAgent::submit(const std::string &kind, DataValue payload, std::string &error)
{
	if(pending_.size() >= 4 || requests_.size() >= 4){error = "Assistant queue full"; return false;}

	auto &p = std::get<O>(payload.value);
	if(kind == "new_chat")
	{
		if(!pending_prompts_.empty()){error = "Assistant is busy"; return false;}

		std::vector<ImageUpload>().swap(images_);
	}

	if(kind == "configure" || kind == "prompt")
		for(const char *key:{"endpoint", "model"})
			if(auto *v = registry_.read(std::string("assistant.") + key))
				p[key] = *v;

	if(kind == "configure" || kind == "prompt" || kind == "models")
	{
		if(auto *v = registry_.read("assistant.free_only")) p["freeOnly"] = *v;

		if(auto *v = registry_.read("assistant.model_filter")) p["modelFilter"] = *v;
	}

	if(kind == "models") if(auto *v = registry_.read("assistant.model_offset")) p["offset"] = *v;

	if(kind == "prompt")
	{
		DataValue::Array attachments;
		for(const auto &image:images_)
		{
			if(!image.ready){error = "Image upload is incomplete"; return false;}

			attachments.emplace_back(O{{"mime", image.mime}, {"name", image.name}, {"data", image.data}});
		}
		if(!attachments.empty()) p["images"] = std::move(attachments);

		if(auto *v = registry_.read("assistant.prompt")) p["prompt"] = *v;
	}

	const auto id = ++next_; pending_[id] = std::chrono::steady_clock::now();
	if(kind == "prompt") pending_prompts_.insert(id);

	requests_.emplace_back(O{{"event", "host_request"}, {"id", id}, {"kind", kind}, {"payload", std::move(payload)}});
	publish("assistant.busy", true); publish("assistant.status", "Выполняется"); return true;
}

bool HostAgent::take(DataValue &v)
{
	if(requests_.empty())
		return false;

	v = std::move(requests_.front()); requests_.pop_front(); return true;
}

void HostAgent::reply(const DataValue &v)
{
	const auto &o = std::get<O>(v.value); const auto id = std::get<int64_t>(o.at("id").value);
	if(!pending_.count(id)) return;

	const auto update = o.find("progress");
	const bool progress = update != o.end() && std::get<bool>(update->second.value);
	if(!progress)
	{
		pending_.erase(id); pending_prompts_.erase(id); publish("assistant.generation", ++completed_);
		const auto accepted = o.find("ok");
		publish("assistant.completion", O{{"generation", completed_},
				{"ok", accepted != o.end() && std::get<bool>(accepted->second.value)}});
	}

	const auto state = o.find("state");
	if(state != o.end())
	{
		const auto &s = std::get<O>(state->second.value);
		for(const char *key:{"endpoint", "model", "status", "reply", "busy", "log", "chat"})
		{
			const auto it = s.find(key); if(it != s.end())
				publish((std::string("assistant.") + key).c_str(), it->second);
		}
		const auto free_only = s.find("freeOnly"); if(free_only != s.end())
			publish("assistant.free_only", free_only->second);

		const auto filter = s.find("modelFilter"); if(filter != s.end())
			publish("assistant.model_filter", filter->second);

		const auto key = s.find("keyPresent"); if(key != s.end()) publish("assistant.key_present", key->second);

		const auto page = s.find("modelPage"); if(page != s.end())
		{
			publish("assistant.model_page", page->second);
			publish("assistant.model_offset", std::get<O>(page->second.value).at("offset"));
		}

		const auto list = s.find("models"); if(list != s.end())
		{
			models_.clear(); std::string options; DataValue::Array catalog;
			for(const auto &item:std::get<DataValue::Array>(list->second.value))
			{
				if(models_.size() == 64)
					break;

				const auto &m = std::get<O>(item.value); const auto name = std::get<std::string>(m.at("id").value);
				if(name.size() > 128 || options.size() + name.size() + (options.empty() ? 0 : 1) > 4096)
					continue;

				const auto title = m.find("title"), free = m.find("free");
				catalog.emplace_back(O{{"id", name}, {"title", title == m.end() ? DataValue(name) : title->second},
						{"free", free == m.end() ? DataValue(false) : free->second}});
				if(encode_data_value(catalog).size() > registry_.limits().value_bytes)
				{
					catalog.pop_back(); break;
				}

				if(!options.empty()) options += '\n';

				options += name; models_.push_back(name);
			}
			publish("assistant.models", options.empty() ? "—" : options);
			publish("assistant.model_catalog", std::move(catalog));
			size_t index = 0; auto selected = s.find("model"); if(selected != s.end())
			{
				const auto &name = std::get<std::string>(selected->second.value); for(size_t i = 0; i < models_.size();
				    ++i)
					if(models_[i] == name)
					{
						index = i; break;
					}
			}

			publish("assistant.model_index", index);
		}
	}

	const auto ok = o.find("ok"); if(!progress && ok != o.end() && !std::get<bool>(ok->second.value))
	{
		const auto e = o.find("error"); publish("assistant.status", e == o.end() ? DataValue("Ошибка") : e->second);
	}

	publish("assistant.busy", !pending_.empty());
}

void HostAgent::tick()
{
	const auto now = std::chrono::steady_clock::now(); const bool was_pending = !pending_.empty();
	for(auto i = pending_.begin(); i != pending_.end();)
		if(now - i->second > std::chrono::minutes(4))
		{
			pending_prompts_.erase(i->first);
			i = pending_.erase(i); publish("assistant.status", "Истекло время ожидания агента");
		}
		else
			++i;

	if(was_pending && pending_.empty()) publish("assistant.busy", false);
}
