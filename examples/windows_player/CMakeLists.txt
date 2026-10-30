cmake_minimum_required(VERSION 3.24)
project(nacborui_windows_player LANGUAGES C CXX)
if(NOT WIN32)
  message(FATAL_ERROR "This example uses the LVGL Windows backend.")
endif()
get_filename_component(ROOT "../.." ABSOLUTE BASE_DIR "${CMAKE_CURRENT_LIST_DIR}")
set(LVGL_SOURCE_DIR "" CACHE PATH "LVGL 9.6.0 source directory")
set(TINYCBOR_SOURCE_DIR "" CACHE PATH "TinyCBOR source directory (contains src/cbor.h)")
# Reuse downloaded sources when present. No ESP-IDF, board sources or server are linked.
set(MANAGED "${ROOT}/examples/s3_style_lab/managed_components")
if(NOT LVGL_SOURCE_DIR AND EXISTS "${MANAGED}/lvgl__lvgl/CMakeLists.txt")
  set(LVGL_SOURCE_DIR "${MANAGED}/lvgl__lvgl")
endif()
if(NOT TINYCBOR_SOURCE_DIR AND EXISTS "${MANAGED}/espressif__cbor/tinycbor/src/cbor.h")
  set(TINYCBOR_SOURCE_DIR "${MANAGED}/espressif__cbor/tinycbor")
endif()
if(NOT EXISTS "${LVGL_SOURCE_DIR}/CMakeLists.txt" OR NOT EXISTS "${TINYCBOR_SOURCE_DIR}/src/cbor.h")
  message(FATAL_ERROR "Set LVGL_SOURCE_DIR (LVGL 9.6.0) and TINYCBOR_SOURCE_DIR (TinyCBOR 0.6.1). See README.md; ESP-IDF is not required.")
endif()
set(LV_BUILD_CONF_PATH "${CMAKE_CURRENT_LIST_DIR}/lv_conf.h" CACHE PATH "" FORCE)
set(CONFIG_LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_USE_THORVG_INTERNAL OFF CACHE BOOL "" FORCE)
add_subdirectory("${LVGL_SOURCE_DIR}" lvgl)
set(CBOR "${TINYCBOR_SOURCE_DIR}/src")
add_library(player_cbor STATIC "${CBOR}/cborparser.c" "${CBOR}/cborparser_float.c"
  "${CBOR}/cborvalidation.c" "${CBOR}/cborerrorstrings.c")
target_include_directories(player_cbor PUBLIC "${CBOR}")
target_compile_definitions(player_cbor PRIVATE CBOR_PARSER_MAX_RECURSIONS=64)
add_library(player_runtime STATIC
  "${ROOT}/src/style_service.cpp" "${ROOT}/src/style_runtime.cpp" "${ROOT}/src/style_dispatch.cpp"
  "${ROOT}/src/screen_runtime.cpp" "${ROOT}/src/screen_decode.cpp" "${ROOT}/src/widget_registry.cpp"
  "${ROOT}/src/widget_dispatch.cpp" "${ROOT}/src/screen_styles.cpp" "${ROOT}/src/capabilities.cpp"
  "${ROOT}/src/project_codec.cpp" "${ROOT}/src/project_service.cpp" "${ROOT}/src/project_store.cpp"
  "${ROOT}/src/project_catalog_store.cpp" "${ROOT}/src/data_value.cpp" "${ROOT}/src/data_registry.cpp"
  "${ROOT}/src/binding_expression.cpp" "${ROOT}/src/screen_bindings.cpp" "${ROOT}/src/screen_views.cpp")
target_include_directories(player_runtime PUBLIC "${ROOT}/include")
target_compile_features(player_runtime PUBLIC cxx_std_17)
target_link_libraries(player_runtime PUBLIC lvgl::lvgl player_cbor)
add_executable(nacborui_player src/main.cpp src/application.cpp src/appearance.cpp src/host_fonts.cpp
  src/system_metrics.cpp src/history_plot.cpp
  ../common/appearance/appearance.cpp ../common/demo_data/demo_data.cpp)
target_compile_definitions(nacborui_player PRIVATE UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN)
file(READ "${CMAKE_CURRENT_LIST_DIR}/history-plot.json" HISTORY_PLOT_CATALOG)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/history-plot.json")
configure_file(src/history_plot_catalog.hpp.in "${CMAKE_CURRENT_BINARY_DIR}/history_plot_catalog.hpp" @ONLY)
target_include_directories(nacborui_player PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
target_link_libraries(nacborui_player PRIVATE player_runtime user32 gdi32 imm32 shcore comdlg32 pdh dxgi)
if(MSVC)
  target_compile_options(nacborui_player PRIVATE /utf-8 /W4)
endif()
