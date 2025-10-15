#!/bin/bash

# Fault-Tolerant Full-Stack Application - Local Development Script
# This script starts all services using Docker Compose

set -e

echo "🚀 Starting Fault-Tolerant Full-Stack Application..."
echo "======================================================"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
    echo "❌ Docker Compose is not available. Please install Docker Compose and try again."
    exit 1
fi

# Detect Docker Compose command
if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

echo "📋 Using Docker Compose command: $COMPOSE_CMD"

# Pull latest images and build
echo "🏗️  Building and pulling images..."
$COMPOSE_CMD pull redis
$COMPOSE_CMD build --no-cache

# Start services
echo "🔄 Starting services..."
$COMPOSE_CMD up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    echo "🔍 Checking $service_name health..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" >/dev/null 2>&1; then
            echo "✅ $service_name is healthy"
            return 0
        fi
        
        echo "⏳ Attempt $attempt/$max_attempts - $service_name not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ $service_name failed to become healthy"
    return 1
}

# Check each service
check_service "Redis" "http://localhost:6379" || echo "⚠️  Redis health check not applicable via HTTP"
check_service "C++ Service" "http://localhost:8080/healthz"
check_service "Function Simulator" "http://localhost:7071/function/health"
check_service "Frontend" "http://localhost:3000"

echo ""
echo "🎉 All services are running!"
echo "=============================="
echo ""
echo "📍 Service Endpoints:"
echo "   Frontend:          http://localhost:3000"
echo "   Function Simulator: http://localhost:7071"
echo "   C++ Service:       http://localhost:8080"
echo "   Redis:             localhost:6379"
echo ""
echo "🧪 Quick Health Check:"
echo "   curl http://localhost:8080/healthz"
echo "   curl http://localhost:7071/function/health"
echo ""
echo "📊 Monitor logs:"
echo "   $COMPOSE_CMD logs -f"
echo ""
echo "🛑 Stop services:"
echo "   $COMPOSE_CMD down"
echo ""
echo "🧹 Clean up everything:"
echo "   $COMPOSE_CMD down -v --remove-orphans"
echo ""

# Show running containers
echo "📦 Running containers:"
$COMPOSE_CMD ps

echo ""
echo "✨ Ready for development! Open http://localhost:3000 in your browser."