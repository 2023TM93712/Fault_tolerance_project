cmake_minimum_required(VERSION 3.10)
project(sensor_gateway)

set(CMAKE_CXX_STANDARD 17)

include_directories(
    ../shared
    ../third_party
)

add_executable(sensor_gateway
    main.cpp
    sensor_sim.cpp
    ../shared/db.cpp
    ../shared/log.cpp
)

target_link_libraries(sensor_gateway sqlite3)
