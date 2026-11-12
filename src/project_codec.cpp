// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/contract.hpp"
#include "cbor_reader.hpp"
#include "project_internal.hpp"
#include <algorithm>
#include <cstring>

namespace lvgl_cbor
{
	namespace project_detail
	{
		bool fail(std::string &error, const char *message)
		{
			error = message; return false;
		}

// Storage APIs may run on a small HTTP task. Check the packet boundary with a bounded
// cursor stack instead of one C++ call frame per nested command/argument array.
		static bool bounded_packet(CborValue &it)
		{
			std::vector<CborValue> parents; parents.reserve(8);
			for(;;)
			{
				if(parents.size() > 40 || cbor_value_is_tag(&it))  return false;

				if(cbor_value_is_container(&it))
				{
					if(!cbor_value_is_length_known(&it))  return false;

					CborValue child;
					if(cbor_value_enter_container(&it, &child) != CborNoError)  return false;

					parents.push_back(it); it = child;
				}
				else if(cbor_value_advance(&it) != CborNoError)  return false;

				while(cbor_value_at_end(&it))
				{
					if(parents.empty())  return true;

					auto parent = parents.back(); parents.pop_back();
					if(cbor_value_leave_container(&parent, &it) != CborNoError)  return false;

					it = parent;
				}
				if(parents.empty())  return true;
			}
		}

		bool map(ProjectBytes bytes, CborParser &parser, CborValue &root)
		{
			if(!bytes.data || !bytes.size || cbor_parser_init(bytes.data, bytes.size, 0, &parser,
			    &root) != CborNoError || !cbor_value_is_map(&root))  return false;

			auto end = root;
			return bounded_packet(end) && cbor_value_get_next_byte(&end) == bytes.data + bytes.size;
		}

		bool string(const CborValue &map, const char *key, std::string &out, size_t max)
		{
			CborValue value; std::vector<char> buffer(max + 1);
			if(!detail::field(map, key, value) || !detail::text(value, buffer.data(), buffer.size()))  return false;

			out = buffer.data(); return !out.empty();
		}

		bool blob(const CborValue &value, const ProjectBytes &parent, ProjectBytes &out)
		{
			if(!cbor_value_is_byte_string(&value) || !cbor_value_is_length_known(&value))  return false;

			const uint8_t *data{}; size_t size{}; CborValue next, chunk = value;
			if(cbor_value_begin_string_iteration(&chunk) != CborNoError || cbor_value_get_byte_string_chunk(&chunk,
			    &data, &size, &next) != CborNoError)  return false;

			out = {data, size, parent.owner}; return size != 0;
		}

		bool collection(const CborValue &root, const char *key, const ProjectBytes &parent,
		    std::vector<ProjectDocument> &out, ProjectLimits limits, bool nullable)
		{
			CborValue value, item; size_t count{};
			if(!detail::field(root, key, value) || !cbor_value_is_map(&value) || cbor_value_get_map_length(&value,
			    &count) != CborNoError || count > limits.items || cbor_value_enter_container(&value,
			    &item) != CborNoError)  return false;

			out.clear();
			for(size_t i = 0; i < count; ++i)
			{
				char name[64]; ProjectBytes bytes;
				if(!detail::text(item, name, sizeof(name)) || !name[0] || std::any_of(out.begin(), out.end(),
				    [&](const auto &entry) {
					return entry.name == name;
				}) || cbor_value_advance(&item) != CborNoError) return false;

				if(!(nullable && cbor_value_is_null(&item)) && !blob(item, parent, bytes))  return false;

				out.push_back({name, bytes}); if(cbor_value_advance(&item) != CborNoError)  return false;
			}
			return cbor_value_at_end(&item);
		}

// The container is small metadata. Native screen/style bytecode is never decoded into a tree.
		bool parse(ProjectBytes bytes, ProjectBundle &out, std::string &error, ProjectLimits limits, bool overlay)
		{
			CborParser parser; CborValue root, value; std::string format;
			if(bytes.size > limits.bytes || !map(bytes, parser, root) || !string(root, "format", format,
			    32) || format != (overlay ? "lvgl-project-overlay-1" : "lvgl-project-1"))
				return fail(error, "project_envelope");

			const char *bundle_keys[]{"format", "manifest", "screens", "styles"};
			const char *overlay_keys[]{"format", "base", "manifest", "screens", "styles", "screenOrder", "styleOrder"};
			if(!detail::keys(root, overlay ? overlay_keys : bundle_keys, overlay ? 7 : 4))
				return fail(error, "project_keys");

			if(!detail::field(root, "manifest", value) || !blob(value, bytes, out.manifest) || out.manifest.size > 8192)
				return fail(error, "project_manifest");

			CborParser metadata_parser; CborValue metadata, requirements;
			std::string screen_abi, style_abi;
			if(!map(out.manifest, metadata_parser, metadata) || !string(metadata, "id", out.id, 63) || !string(metadata,
			    "name", out.name, 128) || !string(metadata, "entry", out.entry, 63) || !detail::field(metadata,
			    "requirements", requirements) || !string(requirements, "screenABI", screen_abi,
			    64) || !string(requirements, "styleABI", style_abi,
			    64) || screen_abi != screen_contract_sha256 || style_abi != contract_sha256)
				return fail(error, "project_manifest_abi");

			const char *manifest_keys[]{"id", "name", "entry", "description", "requirements"};
			const char *requirement_keys[]{"screenABI", "styleABI"};
			if(!detail::keys(metadata, manifest_keys, 5) || !detail::keys(requirements, requirement_keys, 2))
				return fail(error, "project_manifest_keys");

			if(!collection(root, "screens", bytes, out.screens, limits, overlay) || !collection(root, "styles", bytes,
			    out.styles, limits, overlay))  return fail(error, "project_collection");

			if(overlay)  return true;

			return valid(out, error, limits);
		}

		bool valid(const ProjectBundle &bundle, std::string &error, ProjectLimits limits)
		{
			if(bundle.screens.empty() || bundle.screens.size() > limits.items || bundle.styles.size() > limits.items ||
			    !find(bundle.screens, bundle.entry))  return fail(error, "project_entry");

			for(bool styles : {false, true})
				for(const auto &doc : styles ? bundle.styles : bundle.screens)
				{
					CborParser parser; CborValue root, value; std::string name, scope;
					if(!doc.bytes.size || !map(doc.bytes, parser, root) || !string(root, "name", name,
					    styles ? 31 : 63) || name != doc.name)  return fail(error, "project_document_identity");

					if(styles && (!string(root, "scope", scope, 10) || scope != "global" || !detail::field(root,
					    "attach", value) || !cbor_value_is_boolean(&value)))  return fail(error, "project_style_scope");

					bool attach = false;
					if(styles && (cbor_value_get_boolean(&value, &attach) != CborNoError || attach))
						return fail(error, "project_style_attach");
				}
			return true;
		}

		const ProjectDocument *find(const std::vector<ProjectDocument> &docs, const std::string &name)
		{
			const auto found = std::find_if(docs.begin(), docs.end(), [&](const auto &doc) {
				return doc.name == name;
			}); return found == docs.end() ? nullptr : &*found;
		}

		bool equal(ProjectBytes a, ProjectBytes b)
		{
			return a.size == b.size && (!a.size || !std::memcmp(a.data, b.data, a.size));
		}

		std::string fingerprint(const std::vector<uint8_t> &bytes)
		{
			uint64_t hash = 14695981039346656037ULL; for(auto byte : bytes)
			{
				hash ^= byte; hash *= 1099511628211ULL;
			}
			char out[17]; std::snprintf(out, sizeof(out), "%016llx", static_cast<unsigned long long>(hash)); return out;
		}

		ProjectBytes owned(std::vector<uint8_t> bytes)
		{
			auto owner = std::make_shared<const std::vector<uint8_t> >(std::move(bytes));
			return {owner->data(), owner->size(), owner};
		}

// A compact CBOR writer used only for the project envelope. Method arguments stay opaque.
		void Writer::head(unsigned major, uint64_t n)
		{
			if(n < 24)
				data.push_back(uint8_t(major * 32 + n));
			else
			{
				unsigned size = n <= 255 ? 1 : n <= 65535 ? 2 : n <= 0xffffffffULL ? 4 : 8;
				data.push_back(uint8_t(major * 32 + (size == 1 ? 24 : size == 2 ? 25 : size == 4 ? 26 : 27)));
				for(unsigned i = size;
				    i; --i)
					data.push_back(uint8_t(n >> ((i - 1) * 8)));
			}
		}

		void Writer::text(const std::string &s)
		{
			head(3, s.size()); data.insert(data.end(), s.begin(), s.end());
		}

		void Writer::bytes(ProjectBytes bytes)
		{
			head(2, bytes.size); if(bytes.size)
				data.insert(data.end(), bytes.data, bytes.data + bytes.size);
		}

		void Writer::docs(const std::vector<ProjectDocument> &documents, bool nullable)
		{
			head(5, documents.size()); for(const auto &doc : documents)
			{
				text(doc.name); if(nullable && !doc.bytes.size)
					data.push_back(0xf6);
				else
					bytes(doc.bytes);
			}
		}

		void Writer::names(const std::vector<ProjectDocument> &documents)
		{
			head(4, documents.size()); for(const auto &doc : documents)
				text(doc.name);
		}

	} // namespace project_detail
	bool parse_project(ProjectBytes bytes, ProjectBundle &out, std::string &error, ProjectLimits limits)
	{
		out = {}; return project_detail::parse(bytes, out, error, limits, false);
	}

	std::vector<uint8_t> encode_project(const ProjectBundle &bundle)
	{
		project_detail::Writer writer; writer.head(5, 4); writer.text("format"); writer.text("lvgl-project-1");
		writer.text("manifest"); writer.bytes(bundle.manifest); writer.text("screens"); writer.docs(bundle.screens);
		writer.text("styles"); writer.docs(bundle.styles); return std::move(writer.data);
	}

	bool ConstProjectSource::read(ProjectBundle &out, std::string &error, ProjectLimits limits) const
	{
		if(!parse_project(bytes_, out, error, limits))
			return false;

		for(auto &screen : out.screens)
			screen.bytes.validation = bytes_.validation;

		return true;
	}

} // namespace lvgl_cbor
