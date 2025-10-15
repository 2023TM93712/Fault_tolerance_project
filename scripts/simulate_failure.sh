#!/bin/bash

# Fault-Tolerant Full-Stack Application - Failure Simulation Script
# This script simulates various failure scenarios to test fault tolerance

set -e

echo "🧪 Fault-Tolerant Full-Stack Application - Failure Simulation"
echo "=============================================================="

# Detect Docker Compose command
if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_colored() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    
    if curl -f -s "$url" >/dev/null 2>&1; then
        print_colored $GREEN "✅ $service_name is healthy"
        return 0
    else
        print_colored $RED "❌ $service_name is unhealthy"
        return 1
    fi
}

# Function to send test request
send_test_request() {
    local data=$1
    local idempotency_key=$2
    
    echo "📤 Sending test request..."
    echo "Data: $data"
    echo "Idempotency Key: $idempotency_key"
    
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -X POST http://localhost:7071/function/process \
        -H "Content-Type: application/json" \
        -d "{\"data\": \"$data\", \"idempotency_key\": \"$idempotency_key\"}")
    
    http_code=$(echo "$response" | tail -n1 | cut -d: -f2)
    response_body=$(echo "$response" | head -n -1)
    
    echo "Response Code: $http_code"
    echo "Response Body: $response_body"
    echo ""
}

# Function to check DLQ contents
check_dlq() {
    echo "🔍 Checking Dead Letter Queue..."
    response=$(curl -s http://localhost:7071/function/dlq)
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""
}

# Function to wait for user input
wait_for_user() {
    local message=$1
    print_colored $YELLOW "$message"
    read -p "Press Enter to continue..."
    echo ""
}

# Main simulation menu
show_menu() {
    echo ""
    print_colored $BLUE "🎯 Failure Simulation Options:"
    echo "1. Test normal operation (baseline)"
    echo "2. Test idempotency (same request twice)"
    echo "3. Simulate C++ service failure (retry + DLQ)"
    echo "4. Simulate Redis failure"
    echo "5. Load test (concurrent requests)"
    echo "6. Test DLQ replay functionality"
    echo "7. Run all scenarios"
    echo "8. Exit"
    echo ""
}

# Scenario 1: Normal operation
test_normal_operation() {
    print_colored $BLUE "🧪 Scenario 1: Normal Operation"
    echo "Testing baseline functionality..."
    
    check_service "C++ Service" "http://localhost:8080/healthz"
    check_service "Function Simulator" "http://localhost:7071/function/health"
    
    send_test_request "Hello World!" "normal-test-$(date +%s)"
}

# Scenario 2: Idempotency test
test_idempotency() {
    print_colored $BLUE "🧪 Scenario 2: Idempotency Test"
    echo "Testing idempotency behavior..."
    
    local key="idempotency-test-$(date +%s)"
    
    echo "First request:"
    send_test_request "Idempotency Test" "$key"
    
    wait_for_user "Now sending the same request again..."
    
    echo "Second request (should return same result):"
    send_test_request "Idempotency Test" "$key"
}

# Scenario 3: C++ service failure
test_cpp_service_failure() {
    print_colored $BLUE "🧪 Scenario 3: C++ Service Failure Simulation"
    echo "Stopping C++ service to test retry logic and DLQ..."
    
    $COMPOSE_CMD stop cpp_service
    
    wait_for_user "C++ service stopped. Sending request that should fail and go to DLQ..."
    
    send_test_request "This should fail" "failure-test-$(date +%s)"
    
    check_dlq
    
    wait_for_user "Restarting C++ service..."
    
    $COMPOSE_CMD start cpp_service
    sleep 10
    
    check_service "C++ Service" "http://localhost:8080/healthz"
    
    echo "Testing normal operation after restart:"
    send_test_request "After restart" "restart-test-$(date +%s)"
}

# Scenario 4: Redis failure simulation
test_redis_failure() {
    print_colored $BLUE "🧪 Scenario 4: Redis Failure Simulation"
    echo "Stopping Redis to test graceful degradation..."
    
    $COMPOSE_CMD stop redis
    
    wait_for_user "Redis stopped. Testing operation without cache..."
    
    send_test_request "No Redis Test" "redis-down-$(date +%s)"
    
    wait_for_user "Restarting Redis..."
    
    $COMPOSE_CMD start redis
    sleep 10
    
    echo "Testing operation after Redis restart:"
    send_test_request "Redis Back" "redis-back-$(date +%s)"
}

# Scenario 5: Load test
test_load() {
    print_colored $BLUE "🧪 Scenario 5: Load Test"
    echo "Sending concurrent requests to test system under load..."
    
    # Create a temporary script for parallel requests
    cat > /tmp/load_test.sh << 'EOF'
#!/bin/bash
for i in {1..5}; do
    curl -s -X POST http://localhost:7071/function/process \
        -H "Content-Type: application/json" \
        -d "{\"data\": \"Load test $1-$i\", \"idempotency_key\": \"load-$1-$i-$(date +%s)\"}" &
done
wait
EOF
    chmod +x /tmp/load_test.sh
    
    # Run parallel requests
    for batch in {1..3}; do
        echo "Running batch $batch..."
        /tmp/load_test.sh $batch
        sleep 2
    done
    
    rm /tmp/load_test.sh
    
    echo "Load test completed. Checking service health:"
    check_service "Function Simulator" "http://localhost:7071/function/health"
}

# Scenario 6: DLQ replay test
test_dlq_replay() {
    print_colored $BLUE "🧪 Scenario 6: DLQ Replay Test"
    echo "Testing DLQ replay functionality..."
    
    check_dlq
    
    # Try to replay a message (this might fail if no messages in DLQ)
    echo "Attempting to replay DLQ messages..."
    response=$(curl -s -X POST http://localhost:7071/function/dlq/replay \
        -H "Content-Type: application/json" \
        -d '{"message_id": "non-existent"}')
    
    echo "Replay response: $response"
}

# Run all scenarios
run_all_scenarios() {
    print_colored $BLUE "🧪 Running All Failure Simulation Scenarios"
    echo "This will run all test scenarios in sequence..."
    
    test_normal_operation
    wait_for_user "Scenario 1 completed. Continue to Scenario 2?"
    
    test_idempotency
    wait_for_user "Scenario 2 completed. Continue to Scenario 3?"
    
    test_cpp_service_failure
    wait_for_user "Scenario 3 completed. Continue to Scenario 4?"
    
    test_redis_failure
    wait_for_user "Scenario 4 completed. Continue to Scenario 5?"
    
    test_load
    wait_for_user "Scenario 5 completed. Continue to Scenario 6?"
    
    test_dlq_replay
    
    print_colored $GREEN "🎉 All scenarios completed!"
}

# Main loop
while true; do
    show_menu
    read -p "Select an option (1-8): " choice
    
    case $choice in
        1) test_normal_operation ;;
        2) test_idempotency ;;
        3) test_cpp_service_failure ;;
        4) test_redis_failure ;;
        5) test_load ;;
        6) test_dlq_replay ;;
        7) run_all_scenarios ;;
        8) 
            print_colored $GREEN "👋 Goodbye!"
            exit 0
            ;;
        *)
            print_colored $RED "❌ Invalid option. Please select 1-8."
            ;;
    esac
    
    wait_for_user "Scenario completed. Press Enter to return to menu..."
done