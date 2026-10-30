// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "system_metrics.hpp"
#include <windows.h>
#include <pdh.h>
#include <pdhmsg.h>
#include <dxgi1_4.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdio>
#include <cwctype>
#include <map>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <thread>
using namespace lvgl_cbor;
namespace
{
	constexpr size_t history_size = 32, core_limit = 64, gpu_limit = 4, counter_bytes = 4 * 1024 * 1024;
	using History = std::array<int, history_size>;
	using Reading = std::optional<double>;
	struct Adapter {std::string name; std::wstring key; double capacity{}; History history;};
	std::string utf8(const wchar_t *text)
	{
		const int count = WideCharToMultiByte(CP_UTF8, 0, text, -1, nullptr, 0, nullptr, nullptr);
		if(count < 1) return "GPU";

		std::string result(size_t(count), '\0');
		WideCharToMultiByte(CP_UTF8, 0, text, -1, result.data(), count, nullptr, nullptr);
		result.pop_back();
		if(result.size() > 255)
		{
			size_t length = 255; while(length && (static_cast<unsigned char>(result[length]) & 0xc0) == 0x80)
				--length;
			result.resize(length);
		}

		return result;
	}

	std::vector<Adapter> adapters()
	{
		std::vector<Adapter> result; IDXGIFactory1 *factory{};
		if(FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void **>(&factory)))) return result;

		for(UINT i = 0; result.size() < gpu_limit; ++i)
		{
			IDXGIAdapter1 *adapter{}; if(factory->EnumAdapters1(i, &adapter) != S_OK) break;

			DXGI_ADAPTER_DESC1 desc{}; const auto status = adapter->GetDesc1(&desc); adapter->Release();
			if(FAILED(status) || (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE)) continue;

			wchar_t key[64];
			swprintf_s(key, L"luid_0x%08x_0x%08x", unsigned(desc.AdapterLuid.HighPart),
			    unsigned(desc.AdapterLuid.LowPart));
			Adapter item{utf8(desc.Description), key, double(desc.DedicatedVideoMemory) / (1024 * 1024), {}};
			item.history.fill(-1); result.push_back(std::move(item));
		}
		factory->Release(); return result;
	}

	void append(History &history, Reading value)
	{
		std::move(history.begin() + 1, history.end(), history.begin());
		history.back() = value ? int(std::lround(std::clamp(*value, 0.0, 100.0))) : -1;
	}

	DataValue history_value(const History &history)
	{
		DataValue::Array value; for(auto n:history)
			value.emplace_back(n);
		return value;
	}

	std::string percent(Reading value)
	{
		if(!value)
			return "—";

		char text[32]; sprintf_s(text, "%.1f%%", *value); return text;
	}

	DataValue series(const std::string &label, const History &history)
	{
		return DataValue::Object{{"label", label}, {"history", history_value(history)}};
	}

	std::string memory_text(Reading used, double total)
	{
		if(!used) return "— / " + std::to_string(int64_t(total)) + " MiB";

		char text[80]; sprintf_s(text, "%.0f / %.0f MiB", *used, total); return text;
	}

	struct Query {
		PDH_HQUERY handle{};
		PDH_HCOUNTER cpu{}, engines{}, dedicated{}, shared{};
		Query()
		{
			if(PdhOpenQueryW(nullptr, 0, &handle) != ERROR_SUCCESS) return;

			const auto add = [&](const wchar_t *path, PDH_HCOUNTER &counter) {
					if(PdhAddEnglishCounterW(handle, path, 0, &counter) != ERROR_SUCCESS) counter = nullptr;
				};
			add(L"\\Processor Information(*)\\% Processor Time", cpu);
			add(L"\\GPU Engine(*)\\Utilization Percentage", engines);
			add(L"\\GPU Adapter Memory(*)\\Dedicated Usage", dedicated);
			add(L"\\GPU Adapter Memory(*)\\Shared Usage", shared);
			PdhCollectQueryData(handle); // Rate counters need a baseline and a later sample.
		}

		~Query()
		{
			if(handle)
				PdhCloseQuery(handle);
		}

		std::map<std::wstring, double> read(PDH_HCOUNTER counter)
		{
			std::map<std::wstring, double> result; if(!counter) return result;

			// Query the required size again on each retry; instances can appear/disappear.
			for(int attempt = 0; attempt < 3; ++attempt)
			{
				DWORD bytes = 0, count = 0;
				if(PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, &bytes, &count,
				    nullptr) != PDH_MORE_DATA || !bytes || bytes > counter_bytes) return result;

				std::vector<uint64_t> storage((bytes + 7) / 8);
				auto *items = reinterpret_cast<PDH_FMT_COUNTERVALUE_ITEM_W *>(storage.data());
				const auto status = PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, &bytes,
				        &count, items);
				if(status == PDH_MORE_DATA) continue;

				if(status != ERROR_SUCCESS) return result;

				for(DWORD i = 0; i < count; ++i)
					if((items[i].FmtValue.CStatus == PDH_CSTATUS_VALID_DATA ||
					    items[i].FmtValue.CStatus == PDH_CSTATUS_NEW_DATA) &&
					    std::isfinite(items[i].FmtValue.doubleValue))
					{
						std::wstring name = items[i].szName;
						std::transform(name.begin(), name.end(), name.begin(), [](wchar_t c){
							return wchar_t(std::towlower(c));
						});
						result[std::move(name)] = items[i].FmtValue.doubleValue;
					}

				break;
			}
			return result;
		}

	};
}
struct SystemMetrics::Impl {
	DataRegistry &registry; size_t core_count; DWORD detected_cores;
	std::vector<Adapter> gpu;
	std::thread thread; std::mutex mutex; std::condition_variable wake; bool stopping{};
	std::map<std::string, std::vector<uint8_t> > pending;
	std::vector<History> core_history; History cpu_history, memory_history;
	uint64_t sequence{};
	explicit Impl(DataRegistry &r)
	  : registry(r), detected_cores(GetActiveProcessorCount(ALL_PROCESSOR_GROUPS)), gpu(adapters())
	{
		core_count = std::min<size_t>(detected_cores, core_limit); core_history.resize(core_count);
		cpu_history.fill(-1); memory_history.fill(-1); for(auto &h:core_history)
			h.fill(-1);
		using S = DataSchema; std::string error;
		const auto curve = S::object({{"label", S::text(255)}, {"history", S::array(S::integer(-1, 100), 32, 32)}});
		const auto require = [&](bool ok){
				if(!ok)
					throw std::runtime_error(error);
			};
		require(r.add_source({"system.cpu", S::object({{"percent", S::number(0, 100)}, {"count", S::integer(0)},
								  {"displayed", S::integer(0, core_limit)}, {"sequence", S::integer(0)},
								  {"series", curve}}), {}, "CPU total / processor time"}, error));
		require(r.add_source({"system.cores", S::array(curve, core_count, core_count), {},
		                      "Logical processors / history"}, error));
		require(r.add_source({"system.memory", S::object({{"totalMiB", S::number(0)}, {"usedMiB", S::number(0)},
								  {"availableMiB", S::number(0)}, {"percent", S::number(0, 100)},
								  {"summary", S::text(255)}, {"series", curve}}), {}, "Physical RAM"}, error));
		const auto device = S::object({{"name", S::text(255)}, {"percent", S::number(0, 100)},
					{"dedicatedMiB", S::number(0)}, {"capacityMiB", S::number(0)}, {"sharedMiB", S::number(0)},
					{"memoryLabel", S::text(255)}, {"series", curve}});
		require(r.add_source({"system.gpus", S::array(device, gpu.size(), gpu.size()), {},
		                      "GPU / busiest engine; dedicated and shared memory"}, error));
	}

	void sample(Query &q)
	{
		if(q.handle) PdhCollectQueryData(q.handle);

		const auto cpu = q.read(q.cpu), engines = q.read(q.engines), dedicated = q.read(q.dedicated),
		    shared = q.read(q.shared);
		std::map<std::pair<unsigned, unsigned>, double> cores;
		Reading total;
		for(const auto &[name, value]:cpu)
		{
			if(name == L"_total") total = std::clamp(value, 0.0, 100.0);

			wchar_t *end{}; const auto group = wcstoul(name.c_str(), &end, 10);
			if(end == name.c_str() || *end != L',') continue;

			const auto *start = end + 1; const auto index = wcstoul(start, &end, 10);
			if(end != start && !*end) cores[{unsigned(group), unsigned(index)}] = std::clamp(value, 0.0, 100.0);
		}
		append(cpu_history, total);
		DataValue::Object cpu_value{{"count", detected_cores}, {"displayed", core_count}, {"sequence", ++sequence},
			{"series", series("CPU  " + percent(total), cpu_history)}};
		if(total) cpu_value["percent"] = *total;

		DataValue::Array core_values;
		// Numeric group/index order, never lexicographic 0,1,10,... . Missing samples
		// leave a gap instead of silently shifting all subsequent logical processors.
		size_t slot = 0;
		for(WORD group = 0; group < GetActiveProcessorGroupCount() && slot < core_count; ++group)
		{
			const auto count = GetActiveProcessorCount(group);
			for(DWORD index = 0; index < count && slot < core_count; ++index, ++slot)
			{
				auto found = cores.find({group, index}); Reading value;
				if(found != cores.end()) value = found->second;

				append(core_history[slot], value);
				char label[24]; sprintf_s(label, "%02u  ", unsigned(slot));
				core_values.push_back(series(label + percent(value), core_history[slot]));
			}
		}
		while(core_values.size() < core_count)
			core_values.push_back(series("CPU —", core_history[core_values.size()]));
		MEMORYSTATUSEX memory{}; memory.dwLength = sizeof(memory);
		DataValue::Object memory_value; Reading load;
		if(GlobalMemoryStatusEx(&memory) && memory.ullTotalPhys)
		{
			const double capacity = double(memory.ullTotalPhys) / (1024 * 1024),
			    available = double(memory.ullAvailPhys) / (1024 * 1024);
			load = 100 * (capacity - available) / capacity;
			memory_value = {{"totalMiB", capacity}, {"availableMiB", available}, {"usedMiB", capacity - available},
				{"percent", *load}, {"summary", memory_text(capacity - available, capacity)}};
		}
		else memory_value["summary"] = "—";

		append(memory_history, load); memory_value["series"] = series("RAM  " + percent(load), memory_history);
		DataValue::Array devices;
		for(size_t i = 0; i < gpu.size(); ++i)
		{
			auto &adapter = gpu[i]; std::map<std::wstring, double> by_engine; Reading usage, used, shared_used;
			for(const auto &[name, value]:engines)
			{
				auto at = name.find(adapter.key); if(at == std::wstring::npos) continue;

				auto kind = name.find(L"_engtype_", at);
				if(kind == std::wstring::npos) continue;

				// Sum the processes of one physical engine, then take the busiest engine.
				by_engine[name.substr(at, kind - at)] += std::max(0.0, value);
			}
			for(const auto &[name, value]:by_engine)
				usage = std::max(usage.value_or(0), std::clamp(value, 0.0, 100.0));
			for(const auto &[name, value]:dedicated)
				if(name.find(adapter.key) != std::wstring::npos)
					used = used.value_or(0) + std::max(0.0, value) / (1024 * 1024);

			for(const auto &[name, value]:shared)
				if(name.find(adapter.key) != std::wstring::npos)
					shared_used = shared_used.value_or(0) + std::max(0.0, value) / (1024 * 1024);

			append(adapter.history, usage);
			DataValue::Object device{{"name", adapter.name}, {"capacityMiB", adapter.capacity},
				{"memoryLabel",
				 "VRAM " + (used ? std::to_string(int64_t(*used)) : "—") + "/" +
				 std::to_string(int64_t(adapter.capacity)) +
				 "  shared " + (shared_used ? std::to_string(int64_t(*shared_used)) : "—") + " MiB"},
				{"series", series("GPU " + std::to_string(i) + "  " + percent(usage), adapter.history)}};
			if(usage) device["percent"] = *usage;

			if(used) device["dedicatedMiB"] = *used;

			if(shared_used) device["sharedMiB"] = *shared_used;

			devices.emplace_back(std::move(device));
		}
		std::map<std::string, std::vector<uint8_t> > batch;
		batch["system.cpu"] = encode_data_value(cpu_value); batch["system.cores"] = encode_data_value(core_values);
		batch["system.memory"] = encode_data_value(memory_value); batch["system.gpus"] = encode_data_value(devices);
		std::lock_guard<std::mutex> lock(mutex); pending = std::move(batch); // One latest sample, no growing queue.
	}

};
SystemMetrics::SystemMetrics(DataRegistry &r)
  : impl_(std::make_unique<Impl>(r))
{
}

SystemMetrics::~SystemMetrics()
{
	{std::lock_guard<std::mutex> lock(impl_->mutex); impl_->stopping = true;} impl_->wake.notify_all();
	if(impl_->thread.joinable()) impl_->thread.join();
}

void SystemMetrics::start()
{
	if(impl_->thread.joinable()) return;

	impl_->thread = std::thread([this] {
		Query query; auto deadline = std::chrono::steady_clock::now();
		for(;;)
		{
			deadline += std::chrono::seconds(1);
			{std::unique_lock<std::mutex> lock(impl_->mutex);
			 if(impl_->wake.wait_until(lock, deadline, [this]{
					return impl_->stopping;
				})) return;}
			impl_->sample(query);
			if(deadline < std::chrono::steady_clock::now() - std::chrono::seconds(1))
				deadline = std::chrono::steady_clock::now();
		}
	});
}

void SystemMetrics::drain()
{
	std::map<std::string, std::vector<uint8_t> > batch;
	{std::lock_guard<std::mutex> lock(impl_->mutex); batch.swap(impl_->pending);}
	for(const auto &[name, bytes]:batch)
	{
		std::string error;
		if(!impl_->registry.publish_cbor(name, bytes.data(), bytes.size(), error)) throw std::runtime_error(error);
	}
	if(!batch.empty()) impl_->registry.flush();
}
