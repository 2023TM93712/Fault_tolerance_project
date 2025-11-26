FROM debian:stable-slim

RUN apt-get update && apt-get install -y \
 g++ cmake libsqlite3-dev make curl && \
 rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p third_party && \
    curl -L https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h \
        -o third_party/httplib.h

COPY . /app

RUN mkdir -p build_worker && cd build_worker && cmake ../alert_worker && make -j4

CMD ["/app/build_worker/alert_worker"]
