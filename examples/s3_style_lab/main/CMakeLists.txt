# ESP-IDF names extra components after their directory; accept either checkout name.
get_filename_component(livecbor_root "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
get_filename_component(livecbor_component "${livecbor_root}" NAME)
idf_component_register(SRCS main.cpp board.cpp display_config_api.cpp frame_api.cpp screen_endpoint.cpp component_preview.cpp system_status.cpp demo_speed.cpp data_events.cpp native_widgets/registry.cpp INCLUDE_DIRS . PRIV_REQUIRES ${livecbor_component} NaWServer esp_lcd driver esp_wifi esp_event esp_netif nvs_flash esp_timer cbor spi_flash)
option(LVGL_CBOR_PROJECT_API "Expose the optional project editing HTTP adapter" ON)
if(LVGL_CBOR_PROJECT_SERVICE AND LVGL_CBOR_PROJECT_API)
  target_sources(${COMPONENT_LIB} PRIVATE ../../../integrations/nawserver/project_api.cpp)
  target_include_directories(${COMPONENT_LIB} PRIVATE ../../../integrations/nawserver)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE LVGL_CBOR_PROJECT_API=1)
  target_compile_options(${COMPONENT_LIB} PRIVATE -fstack-usage)
  idf_component_get_property(project_core ${livecbor_component} COMPONENT_LIB)
  target_compile_options(${project_core} PRIVATE -fstack-usage)
endif()
if(LVGL_CBOR_PROJECT_SERVICE)
  idf_component_optional_requires(PRIVATE spiffs)
endif()
option(LVGL_CBOR_DEMO_TOUCH "Connect the existing GT911 driver to LVGL input" ON)
if(LVGL_CBOR_DEMO_TOUCH)
  idf_component_optional_requires(PRIVATE esp_lcd_touch esp_lcd_touch_gt911)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE LVGL_CBOR_DEMO_TOUCH=1)
endif()
option(LVGL_CBOR_DATA_API "Expose the optional application data HTTP adapter" ON)
if(LVGL_CBOR_DATA_API)
  target_sources(${COMPONENT_LIB} PRIVATE ../../../integrations/nawserver/data_api.cpp)
  target_include_directories(${COMPONENT_LIB} PRIVATE ../../../integrations/nawserver)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE LVGL_CBOR_DATA_API=1)
endif()

# Shared appearance runtime used by Windows and LilyGO.
target_sources(${COMPONENT_LIB} PRIVATE ../../common/appearance/appearance.cpp)
target_include_directories(${COMPONENT_LIB} PRIVATE ../../common/appearance)

if(LVGL_CBOR_PROJECT_SERVICE)
  target_sources(${COMPONENT_LIB} PRIVATE ../../common/layout_debug/layout_diagnostics.cpp)
  target_include_directories(${COMPONENT_LIB} PRIVATE ../../common/layout_debug)
endif()

# Remote pointer shares the Windows implementation, independent of physical touch.
target_sources(${COMPONENT_LIB} PRIVATE ../../common/native_view/pointer.cpp)
target_include_directories(${COMPONENT_LIB} PRIVATE ../../common/native_view)

target_include_directories(${COMPONENT_LIB} PRIVATE ../../../integrations/nawserver)

option(LVGL_CBOR_TRANSFER_DIRTY "Enable dirty region transmission" ON)
option(LVGL_CBOR_TRANSFER_CYCLIC "Enable cyclic full-frame transmission" ON)
if(NOT LVGL_CBOR_TRANSFER_DIRTY AND NOT LVGL_CBOR_TRANSFER_CYCLIC)
  message(FATAL_ERROR "Enable at least one display transfer mode")
endif()
target_compile_definitions(${COMPONENT_LIB} PRIVATE
  LVGL_CBOR_TRANSFER_DIRTY=$<BOOL:${LVGL_CBOR_TRANSFER_DIRTY}>
  LVGL_CBOR_TRANSFER_CYCLIC=$<BOOL:${LVGL_CBOR_TRANSFER_CYCLIC}>)
