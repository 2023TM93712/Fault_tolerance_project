cmake_minimum_required(VERSION 3.10)
project(auth_service)

set(CMAKE_CXX_STANDARD 17)

include_directories(
    ../shared
    ../third_party
)

add_executable(auth_service
    main.cpp
    ../shared/db.cpp
    ../shared/log.cpp
)

target_link_libraries(auth_service sqlite3)
