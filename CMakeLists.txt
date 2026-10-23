idf_component_register(SRCS src/capabilities.cpp src/style_service.cpp src/style_runtime.cpp src/style_dispatch.cpp src/screen_runtime.cpp src/screen_decode.cpp src/widget_registry.cpp src/widget_dispatch.cpp
    src/screen_styles.cpp src/data_value.cpp src/data_registry.cpp src/binding_expression.cpp src/screen_bindings.cpp src/screen_views.cpp INCLUDE_DIRS include REQUIRES lvgl cbor)
target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_17)
option(LVGL_CBOR_PROJECT_SERVICE "Build the optional project service and storage adapters" ON)
target_compile_definitions(${COMPONENT_LIB} PUBLIC LVGL_CBOR_HAS_PROJECT_SERVICE=$<BOOL:${LVGL_CBOR_PROJECT_SERVICE}>)
if(LVGL_CBOR_PROJECT_SERVICE)
  target_sources(${COMPONENT_LIB} PRIVATE src/project_codec.cpp src/project_service.cpp src/project_store.cpp src/project_catalog_store.cpp)
endif()
