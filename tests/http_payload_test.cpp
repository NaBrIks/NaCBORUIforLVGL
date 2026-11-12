// SPDX-License-Identifier: MIT
#include "response_payload.hpp"
#include <cassert>
#include <iostream>
using namespace NaWServer;
struct Capture {
	OwnedResponseSource source;
	bool reject{};
	static SendResult take(void *context, int, const char *, const Header *, size_t, OwnedResponseSource &source)
	{
		auto &self = *static_cast<Capture *>(context);
		if(self.reject) return SendResult::TransportError;
		self.source = std::move(source); return SendResult::Ok;
	}
	ResponseTransport transport() { ResponseTransport t{}; t.context = this; t.send_owned_source = take; return t; }
};
int main()
{
	Capture capture;
	{
		Response response(capture.transport());
		assert(lvgl_cbor::http_payload::json(response, 200, std::string(64000, 'x')) == SendResult::Ok);
	}
	auto view = capture.source.view(); assert(view.size == 64000);
	uint8_t block[777]; size_t offset = 0;
	while(offset < view.size) {
		auto read = view.read(view.context, offset, block, sizeof(block));
		assert(read.status == BodyReadStatus::Data && read.size > 0);
		for(size_t i = 0; i < read.size; ++i) assert(block[i] == 'x');
		offset += read.size;
	}
	assert(view.read(view.context, offset, block, sizeof(block)).status == BodyReadStatus::End);
	capture.source.reset();
	std::weak_ptr<const void> weak;
	{
		auto owner = std::make_shared<const std::vector<uint8_t>>(10000, 42); weak = owner;
		Response response(capture.transport());
		assert(lvgl_cbor::http_payload::send(response, 200, "application/cbor", owner, owner->data(), owner->size()) == SendResult::Ok);
	}
	assert(!weak.expired()); capture.source.reset(); assert(weak.expired());
	capture.reject = true;
	{
		auto owner = std::make_shared<const std::vector<uint8_t>>(10000, 42); weak = owner;
		Response response(capture.transport());
		assert(lvgl_cbor::http_payload::send(response, 200, "application/cbor", owner, owner->data(), owner->size()) == SendResult::TransportError);
	}
	assert(weak.expired());
	std::cout << "PASS: large deferred payload survives callback; ownership released on completion/drop/reject\n";
}
