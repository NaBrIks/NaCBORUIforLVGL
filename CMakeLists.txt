set(NA_CBOR_LVGL_COMPONENT "lvgl" CACHE STRING "ESP-IDF LVGL component name")
set(NA_CBOR_CBOR_COMPONENT "cbor" CACHE STRING "ESP-IDF CBOR component name")
# Early requirement expansion is a separate CMake script, without the cache.
# Explicit environment values are inherited by both expansion phases.
foreach(component_option NA_CBOR_LVGL_COMPONENT NA_CBOR_CBOR_COMPONENT)
    if(DEFINED ENV{${component_option}})
        set(${component_option} "$ENV{${component_option}}")
    endif()
endforeach()
idf_component_register(SRCS src/capabilities.cpp src/style_service.cpp src/style_runtime.cpp src/style_dispatch.cpp src/screen_runtime.cpp src/screen_decode.cpp src/widget_registry.cpp src/widget_dispatch.cpp
    src/screen_styles.cpp src/data_value.cpp src/data_registry.cpp src/data_catalog.cpp src/binding_expression.cpp src/screen_bindings.cpp src/screen_views.cpp INCLUDE_DIRS include REQUIRES ${NA_CBOR_LVGL_COMPONENT} ${NA_CBOR_CBOR_COMPONENT})
target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_17)
option(LVGL_CBOR_PROJECT_SERVICE "Build the optional project service and storage adapters" ON)
target_compile_definitions(${COMPONENT_LIB} PUBLIC LVGL_CBOR_HAS_PROJECT_SERVICE=$<BOOL:${LVGL_CBOR_PROJECT_SERVICE}>)
if(LVGL_CBOR_PROJECT_SERVICE)
  target_sources(${COMPONENT_LIB} PRIVATE src/project_codec.cpp src/project_service.cpp src/project_store.cpp src/project_catalog_store.cpp)
endif()

option(LVGL_CBOR_HISTORY "Build optional bounded application-owned time series" OFF)
target_compile_definitions(${COMPONENT_LIB} PUBLIC LVGL_CBOR_HAS_HISTORY=$<BOOL:${LVGL_CBOR_HISTORY}>)
if(LVGL_CBOR_HISTORY)
  target_sources(${COMPONENT_LIB} PRIVATE src/data_history.cpp)
endif()
