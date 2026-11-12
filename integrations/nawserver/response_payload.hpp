// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <NaWServer/response.h>
#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <vector>
namespace lvgl_cbor::http_payload
{
	// Own just the lifetime, not a second payload copy. Flash spans may have no owner.
	inline NaWServer::SendResult send(NaWServer::Response &response, int status, const char *type,
	    std::shared_ptr<const void> owner, const uint8_t *data, size_t size)
	{
#if defined(CONFIG_NAWSERVER_TCP_MANAGED) && CONFIG_NAWSERVER_TCP_MANAGED
		struct Payload { std::shared_ptr<const void> owner; const uint8_t *data; size_t size; };
		auto *payload = new Payload{std::move(owner), data, size};
		NaWServer::OwnedResponseSource source({payload, size,
		    [](void *context, size_t offset, uint8_t *out, size_t capacity) -> NaWServer::BodyReadResult
		    {
			const auto &p = *static_cast<Payload *>(context);
			if(offset >= p.size) return {};
			const auto count = std::min(capacity, p.size - offset);
			std::memcpy(out, p.data + offset, count);
			return {NaWServer::BodyReadStatus::Data, count};
		    }}, [](void *context){ delete static_cast<Payload *>(context); });
		return response.sendOwnedSource(status, type, std::move(source));
#else
		(void)owner;
		return response.send(status, type, {data, size});
#endif
	}

	inline NaWServer::SendResult json(NaWServer::Response &response, int status, std::string text)
	{
#if defined(CONFIG_NAWSERVER_TCP_MANAGED) && CONFIG_NAWSERVER_TCP_MANAGED
		auto owner = std::make_shared<const std::string>(std::move(text));
		return send(response, status, "application/json", owner,
		    reinterpret_cast<const uint8_t *>(owner->data()), owner->size());
#else
		return response.send(status, "application/json", {reinterpret_cast<const uint8_t *>(text.data()), text.size()});
#endif
	}
}
