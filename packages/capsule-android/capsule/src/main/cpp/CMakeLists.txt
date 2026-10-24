# Docs: docs/concepts/primers/jni-and-cpp.md, docs/concepts/primers/quickjs.md, docs/concepts/primers/civetweb.md
cmake_minimum_required(VERSION 3.22.1)
project(capsule_native C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Vendored C shared with the iOS build — packages/native/ (each folder has a README + VERSION).
set(NATIVE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../native)
set(QUICKJS_DIR ${NATIVE_DIR}/quickjs)
set(CIVETWEB_DIR ${NATIVE_DIR}/civetweb)

# ── QuickJS static library ─────────────────────────────────────────────────────
add_library(quickjs STATIC
    ${QUICKJS_DIR}/quickjs.c
    ${QUICKJS_DIR}/dtoa.c
    ${QUICKJS_DIR}/libregexp.c
    ${QUICKJS_DIR}/libunicode.c
)

target_include_directories(quickjs PUBLIC ${QUICKJS_DIR})

target_compile_definitions(quickjs PRIVATE
    _GNU_SOURCE
    CONFIG_VERSION="capsule-quickjs-ng"
)

target_compile_options(quickjs PRIVATE
    -Wno-implicit-function-declaration
    -Wno-sign-compare
    -Wno-unused-variable
    -Wno-unused-but-set-variable
)

# ── QuickJS JNI shared library (QuickJSEngineImpl.kt) ──────────────────────────
add_library(capsule_quickjs_jni SHARED
    quickjs_jni.c
)

target_link_libraries(capsule_quickjs_jni
    quickjs
    android
    log
)

# ── CivetWeb static library ────────────────────────────────────────────────────
add_library(civetweb STATIC
    ${CIVETWEB_DIR}/src/civetweb.c
)

target_include_directories(civetweb PUBLIC ${CIVETWEB_DIR}/include)

# Same defines as the iOS CCivetweb target in Package.swift — see packages/native/civetweb/README.md.
target_compile_definitions(civetweb PRIVATE
    NO_SSL
    NO_CGI
    NO_FILES
    NO_CACHING
)

# ── Embedded server JNI shared library (CivetwebServer.kt) ─────────────────────
add_library(capsule_server SHARED
    capsule_server_jni.c
)

target_link_libraries(capsule_server
    civetweb
    android
    log
)
