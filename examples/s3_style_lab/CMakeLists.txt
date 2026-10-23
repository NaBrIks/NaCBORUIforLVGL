cmake_minimum_required(VERSION 3.16)
# PlatformIO 6.10 bundles a component manager unable to parse LVGL 9.6's
# CONFIG-dependent optional dependencies. Keep its upgrade project-local.
set(_manager "${CMAKE_CURRENT_LIST_DIR}/../../local/idf-manager-libs")
if(EXISTS "${_manager}/idf_component_manager")
 set(ENV{PYTHONPATH} "${_manager}")
else()
 message(FATAL_ERROR "Run tools/build_s3.ps1 to prepare the project-local component manager 2.5.2")
endif()
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../.." "${CMAKE_CURRENT_LIST_DIR}/../../../NaWServer")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
set(PROJECT_VER "0.1.0-style-lab")
project(lvgl_cbor_style_lab)
# Match native tests. ScreenRuntime rejects nesting deeper than 40 before complete validation.
target_compile_definitions(__idf_espressif__cbor PRIVATE CBOR_PARSER_MAX_RECURSIONS=64)
if(CMAKE_HOST_WIN32 AND CMAKE_C_COMPILER_ID STREQUAL "GNU" AND CMAKE_C_COMPILER_VERSION VERSION_EQUAL "14.2.0")
 target_compile_options(__idf_esp_lcd PRIVATE -Os)
endif()
