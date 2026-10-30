get_filename_component(ui_root "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
get_filename_component(ui_component "${ui_root}" NAME)
idf_component_register(SRCS main.cpp board.cpp
  ../../common/appearance/appearance.cpp ../../common/demo_data/demo_data.cpp
  INCLUDE_DIRS . ../../common/appearance ../../common/demo_data
  PRIV_REQUIRES ${ui_component} esp_lcd esp_driver_gpio esp_driver_usb_serial_jtag esp_timer)
