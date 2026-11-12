get_filename_component(ui_root "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
get_filename_component(ui_component "${ui_root}" NAME)
if(LILYGO_NATIVE_WS)
  set(view_sources view_network.cpp)
  set(view_requires NaWServer esp_wifi esp_event esp_netif nvs_flash)
endif()
idf_component_register(SRCS ${view_sources} main.cpp board.cpp
  ../../common/appearance/appearance.cpp ../../common/demo_data/demo_data.cpp
  ../../common/native_view/pointer.cpp
  INCLUDE_DIRS . ../../common/appearance ../../common/demo_data ../../common/native_view
  PRIV_REQUIRES ${ui_component} esp_lcd esp_driver_gpio esp_driver_usb_serial_jtag esp_timer ${view_requires})
if(LILYGO_NATIVE_WS)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE LILYGO_NATIVE_WS=1)
endif()
