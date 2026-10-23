option(LVGL_CBOR_DEMO_BLE_SCANNER "Build the optional real yabt BLE scanner" ON)
if(LVGL_CBOR_DEMO_BLE_SCANNER)
  get_filename_component(_yabt "${CMAKE_CURRENT_LIST_DIR}/../../../../../ESP32-yabt/src" ABSOLUTE)
  if(NOT EXISTS "${_yabt}/yabt_utils.cpp")
    message(FATAL_ERROR "Optional scanner requires the owner's external yabt library at ${_yabt}; disable LVGL_CBOR_DEMO_BLE_SCANNER to omit it")
  endif()
  target_sources(${COMPONENT_LIB} PRIVATE "${CMAKE_CURRENT_LIST_DIR}/scanner.cpp" "${_yabt}/yabt_utils.cpp")
  target_include_directories(${COMPONENT_LIB} PRIVATE "${_yabt}")
  # Only the adapter requires C++20 std::span. The unchanged external parser
  # also contains std::views::join_with in an unused helper and requires C++23.
  # Keep both per-source flags out of PlatformIO's build_unflags filter.
  set_source_files_properties("${CMAKE_CURRENT_LIST_DIR}/scanner.cpp" PROPERTIES COMPILE_OPTIONS "-std=gnu++20")
  set_source_files_properties("${_yabt}/yabt_utils.cpp" PROPERTIES COMPILE_OPTIONS "-std=gnu++23")
  target_compile_definitions(${COMPONENT_LIB} PRIVATE LVGL_CBOR_DEMO_BLE_SCANNER=1)
  idf_component_optional_requires(PRIVATE bt)
else()
  target_compile_definitions(${COMPONENT_LIB} PRIVATE LVGL_CBOR_DEMO_BLE_SCANNER=0)
endif()
