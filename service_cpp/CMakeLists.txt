cmake_minimum_required(VERSION 3.16)
project(cpp_service)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(PkgConfig REQUIRED)
pkg_check_modules(HIREDIS REQUIRED hiredis)

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${HIREDIS_INCLUDE_DIRS})

# Main executable
add_executable(cpp_service main.cpp)

# Link libraries
target_link_libraries(cpp_service ${HIREDIS_LIBRARIES} pthread)
target_compile_options(cpp_service PRIVATE ${HIREDIS_CFLAGS_OTHER})

# Download single-header libraries if not present
set(HTTPLIB_HEADER "${CMAKE_SOURCE_DIR}/include/httplib.h")
set(JSON_HEADER "${CMAKE_SOURCE_DIR}/include/nlohmann/json.hpp")

if(NOT EXISTS ${HTTPLIB_HEADER})
    file(DOWNLOAD 
        "https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.14.3/httplib.h"
        ${HTTPLIB_HEADER}
        SHOW_PROGRESS
    )
endif()

if(NOT EXISTS ${JSON_HEADER})
    file(MAKE_DIRECTORY "${CMAKE_SOURCE_DIR}/include/nlohmann")
    file(DOWNLOAD 
        "https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp"
        ${JSON_HEADER}
        SHOW_PROGRESS
    )
endif()

# Enable testing
enable_testing()

# Google Test
find_package(GTest QUIET)
if(GTest_FOUND)
    # Test executable
    add_executable(cpp_service_tests
        tests/test_processing.cpp
        tests/test_main.cpp
    )
    
    # Create a library for testable functions
    add_library(processing_lib STATIC
        main.cpp
    )
    target_compile_definitions(processing_lib PRIVATE TESTING_BUILD)
    target_link_libraries(processing_lib ${HIREDIS_LIBRARIES} pthread)
    target_compile_options(processing_lib PRIVATE ${HIREDIS_CFLAGS_OTHER})
    
    target_link_libraries(cpp_service_tests 
        processing_lib
        GTest::gtest 
        GTest::gtest_main 
        ${HIREDIS_LIBRARIES}
        pthread
    )
    
    add_test(NAME cpp_service_tests COMMAND cpp_service_tests)
else()
    message(WARNING "Google Test not found. Tests will not be built.")
endif()

# Install
install(TARGETS cpp_service DESTINATION bin)