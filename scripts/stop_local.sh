#!/bin/bash

# Fault-Tolerant Full-Stack Application - Stop Local Services
# This script stops all services and cleans up Docker resources

set -e

echo "🛑 Stopping Fault-Tolerant Full-Stack Application..."
echo "===================================================="

# Detect Docker Compose command
if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

echo "📋 Using Docker Compose command: $COMPOSE_CMD"

# Check if there are running services
if $COMPOSE_CMD ps -q | grep -q .; then
    echo "🔄 Stopping services..."
    $COMPOSE_CMD stop
    
    echo "🗑️  Removing containers..."
    $COMPOSE_CMD down
    
    # Ask if user wants to remove volumes
    echo ""
    read -p "🧹 Do you want to remove persistent volumes (Redis data will be lost)? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Removing volumes..."
        $COMPOSE_CMD down -v
        
        # Clean up any dangling volumes
        echo "🧹 Cleaning up dangling volumes..."
        docker volume prune -f
    fi
    
    # Ask if user wants to remove images
    echo ""
    read -p "🗑️  Do you want to remove built images? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Removing built images..."
        
        # Remove images with the project prefix
        docker images --format "table {{.Repository}}:{{.Tag}}" | grep "fault-tolerant-fullstack" | while read -r image; do
            if [ "$image" != "REPOSITORY:TAG" ]; then
                echo "Removing image: $image"
                docker rmi "$image" 2>/dev/null || echo "Failed to remove $image"
            fi
        done
        
        # Clean up dangling images
        echo "🧹 Cleaning up dangling images..."
        docker image prune -f
    fi
    
    echo ""
    echo "✅ Services stopped successfully!"
    
else
    echo "ℹ️  No running services found."
fi

# Clean up any remaining containers with the project prefix
echo "🧹 Cleaning up any remaining containers..."
docker ps -a --format "table {{.Names}}" | grep "fault-tolerant-fullstack" | while read -r container; do
    if [ "$container" != "NAMES" ]; then
        echo "Removing container: $container"
        docker rm -f "$container" 2>/dev/null || echo "Failed to remove $container"
    fi
done

# Clean up networks
echo "🧹 Cleaning up networks..."
docker network ls --format "table {{.Name}}" | grep "fault-tolerant-fullstack" | while read -r network; do
    if [ "$network" != "NAME" ]; then
        echo "Removing network: $network"
        docker network rm "$network" 2>/dev/null || echo "Failed to remove $network"
    fi
done

echo ""
echo "🎉 Cleanup completed!"
echo "==================="
echo ""
echo "💡 To start services again, run:"
echo "   ./scripts/run_local.sh"
echo ""