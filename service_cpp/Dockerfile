FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libhiredis-dev \
    pkg-config \
    curl \
    ca-certificates \
    libgtest-dev \
    && rm -rf /var/lib/apt/lists/*

# Build Google Test
RUN cd /usr/src/gtest && \
    cmake . && \
    make && \
    cp lib/*.a /usr/lib

WORKDIR /app

# Copy source code
COPY . .

# Create build directory and build
RUN mkdir build && cd build && \
    cmake .. && \
    make

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

# Expose port
EXPOSE 8080

# Run the application
CMD ["./build/cpp_service"]