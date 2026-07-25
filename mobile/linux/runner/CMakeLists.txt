cmake_minimum_required(VERSION 3.13)
project(runner LANGUAGES CXX)

# Define the application target. To change its name, change BINARY_NAME in the
# top-level CMakeLists.txt, not the value here, or `flutter run` will no longer
# work.
#
# Any new source files that you add to the application should be added here.
add_executable(${BINARY_NAME}
  "main.cc"
  "my_application.cc"
  "${FLUTTER_MANAGED_DIR}/generated_plugin_registrant.cc"
)

# Apply the standard set of build settings. This can be removed for applications
# that need different build settings.
apply_standard_settings(${BINARY_NAME})

# Add preprocessor definitions for the application ID.
add_definitions(-DAPPLICATION_ID="${APPLICATION_ID}")

# Add dependency libraries. Add any application-specific dependencies here.
target_link_libraries(${BINARY_NAME} PRIVATE flutter)
target_link_libraries(${BINARY_NAME} PRIVATE PkgConfig::GTK)

# Snap-Flutter workaround: flutter_secure_storage_linux links the host
# libsecret-1, which is built against glib >= 2.80, while the snap toolchain
# links its bundled glib 2.64 - leaving new glib symbols (e.g.
# g_task_set_static_name) undefined at link time. The host glib (same soname,
# superset ABI) is what actually loads at runtime, so allow these
# shared-library symbols to resolve dynamically instead of failing the link.
target_link_options(${BINARY_NAME} PRIVATE -Wl,--allow-shlib-undefined)

target_include_directories(${BINARY_NAME} PRIVATE "${CMAKE_SOURCE_DIR}")
