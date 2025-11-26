cmake_minimum_required(VERSION 3.10)
project(alert_worker)

set(CMAKE_CXX_STANDARD 17)

include_directories(
    ../shared
    ../third_party
)

add_executable(alert_worker
    main.cpp
    ../shared/db.cpp
    ../shared/log.cpp
)
target_link_libraries(alert_worker sqlite3)

