FROM debian:stable-slim

RUN apt-get update && apt-get install -y \
    g++ cmake libsqlite3-dev make curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p third_party/nlohmann && \
    curl -L https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h \
        -o third_party/httplib.h && \
    curl -L https://raw.githubusercontent.com/nlohmann/json/master/single_include/nlohmann/json.hpp \
        -o third_party/nlohmann/json.hpp

COPY . /app

RUN mkdir -p build_auth && cd build_auth && \
    cmake ../auth_service && \
    make -j4

EXPOSE 9001
CMD ["/app/build_auth/auth_service"]
