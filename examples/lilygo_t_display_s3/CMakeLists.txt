cmake_minimum_required(VERSION 3.16)
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../..")
if(LILYGO_NATIVE_WS)
  list(APPEND EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../../../NaWServer")
  set(SDKCONFIG_DEFAULTS "sdkconfig.defaults;sdkconfig.defaults.ws")
endif()
# Reuse pinned source libraries.
list(APPEND EXTRA_COMPONENT_DIRS
  "${CMAKE_CURRENT_LIST_DIR}/managed_components/lvgl__lvgl"
  "${CMAKE_CURRENT_LIST_DIR}/managed_components/espressif__cbor")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(nacborui_lilygo)
target_compile_definitions(__idf_espressif__cbor PRIVATE CBOR_PARSER_MAX_RECURSIONS=64)
