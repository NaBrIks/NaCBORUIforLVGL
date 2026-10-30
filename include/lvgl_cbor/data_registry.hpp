// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "binding_contract.hpp"
#include <cstdint>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <string>
#include <type_traits>
#include <variant>
#include <vector>
namespace lvgl_cbor
{
	struct DataValue {
		using Array = std::vector<DataValue>;
		using Object = std::map<std::string, DataValue>;
		using Storage = std::variant<std::monostate, bool, int64_t, double, std::string, Array, Object>;
		Storage value;
		DataValue() = default;
		DataValue(std::nullptr_t)
		  : value(std::monostate{})
		{
		}

		DataValue(bool v)
		  : value(v)
		{
		}

		template <class T, std::enable_if_t<std::is_integral_v<T> && !std::is_same_v<T, bool>, int> = 0>
		DataValue(T v)
		{
			if constexpr(std::is_unsigned_v<T>)
			{
				if(uint64_t(v) > 9007199254740991ULL)
				{
					value = double(v);
					return;
				}
			}
			else if(int64_t(v) < -9007199254740991LL || int64_t(v) > 9007199254740991LL)
			{
				value = double(v);
				return;
			}

			value = int64_t(v);
		}

		DataValue(double v)
		  : value(v)
		{
		}

		DataValue(const char *v)
		  : value(std::string(v ? v : ""))
		{
		}

		DataValue(std::string v)
		  : value(std::move(v))
		{
		}

		DataValue(Array v)
		  : value(std::move(v))
		{
		}

		DataValue(Object v)
		  : value(std::move(v))
		{
		}

		bool operator==(const DataValue &other) const;
		bool operator!=(const DataValue &other) const
		{
			return !(*this == other);
		}

	};
	using DataPath = std::vector<std::variant<std::string, size_t> >;
	enum class DataState { Unknown, Known, Stale };
	struct DataSchema {
		enum class Type { Null, Bool, Integer, Number, Text, Object, Array };
		Type type = Type::Null;
		double min = -std::numeric_limits<double>::max(), max = std::numeric_limits<double>::max();
		size_t max_bytes = binding_contract::textBytes, min_items{}, max_items{};
		std::map<std::string, DataSchema> fields;
		std::shared_ptr<const DataSchema> items;
		static DataSchema null();
		static DataSchema boolean();
		static DataSchema integer(double min = -9007199254740991.0, double max = 9007199254740991.0);
		static DataSchema number(double min = -std::numeric_limits<double>::max(),
		    double max = std::numeric_limits<double>::max());
		static DataSchema text(size_t max_bytes = binding_contract::textBytes);
		static DataSchema object(std::map<std::string, DataSchema>);
		static DataSchema array(DataSchema, size_t max_items, size_t min_items = 0);
	};
	struct DataLimits {
		size_t sources = binding_contract::sources, actions = binding_contract::actions,
		    value_bytes = binding_contract::valueBytes,
		    snapshot_bytes = binding_contract::snapshotBytes,
		    event_queue = binding_contract::eventQueue,
		    event_queue_bytes = binding_contract::eventQueueBytes;
	};
	using DataWrite = std::function<bool (const DataPath &, const DataValue &, std::string &)>;
	using DataActionHandler = std::function<bool (const DataValue &, std::string &)>;
	struct DataSource {
		std::string name;
		DataSchema schema;
		DataWrite write{};
		std::string title{};
	};
	struct DataAction {
		std::string name;
		DataSchema schema;
		DataActionHandler invoke;
		std::string title{};
	};
	bool decode_data_value(const uint8_t *, size_t, DataValue &, std::string &,
	    size_t max_bytes = binding_contract::valueBytes,
	    size_t max_depth = binding_contract::valueDepth);
	std::vector<uint8_t> encode_data_value(const DataValue &);
	std::string data_value_json(const DataValue &);
	const DataValue *data_path(const DataValue &, const DataPath &);
	bool validate_data_value(const DataValue &, const DataSchema &, std::string &);
	const DataSchema *data_schema_path(const DataSchema &, const DataPath &);
	class DataRegistry
	{
	public:
		// All methods run in the application's serialized UI context. Transport/domain tasks post
		// owned values to that context; the core does not create threads, queues or network endpoints.
		struct Subscription {
			std::shared_ptr<void> state;
			explicit operator bool() const {
				return bool(state);
			}
		};
		struct DemandToken {
			std::shared_ptr<void> state;
			explicit operator bool() const {
				return bool(state);
			}
		};
		explicit DataRegistry(DataLimits = {});
		~DataRegistry();
		DataRegistry(const DataRegistry &) = delete;
		DataRegistry &operator=(const DataRegistry &) = delete;
		bool add_source(DataSource, std::string &);
		bool add_action(DataAction, std::string &);
		bool publish(const std::string &, DataValue, std::string &, DataState = DataState::Known);
		bool publish_cbor(const std::string &, const uint8_t *, size_t, std::string &,
		    DataState = DataState::Known);
		bool invalidate(const std::string &, std::string &);
		void flush();
		// Reads borrow the last committed snapshot and are invalidated by its next flush. publish()
		// queues complete replacements; one flush commits the entire batch before notifying observers.
		const DataValue *read(const std::string &, const DataPath &path = {},
		    DataState *state = nullptr) const;
		const DataSource *source(const std::string &) const;
		const DataAction *action(const std::string &) const;
		bool invoke(const std::string &, const DataValue &, std::string &);
		bool write(const std::string &, const DataPath &, const DataValue &, std::string &);
		uint64_t revision() const;
		DataLimits limits() const;
		size_t demand(const std::string &) const;
		DemandToken retain(const std::string &);
		// Tokens release source demand when their final copy dies. Demand never disables application
		// processing: adapters may use it only to skip extraction performed exclusively for UI consumers.
		Subscription observe(const std::vector<std::string> &, std::function<void()>);
		bool defer(std::weak_ptr<void> owner, size_t bytes, std::function<void()>, std::string &);
		void request(const Subscription &);
		void binding_error(const std::string &);
		std::string catalog_json() const;
		std::string snapshot_json() const;

	private:
		struct Impl;
		std::unique_ptr<Impl> impl_;
	};
} // namespace lvgl_cbor
