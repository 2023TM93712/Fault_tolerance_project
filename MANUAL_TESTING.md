#!/bin/bash

# Manual Testing Script for Fault-Tolerant Full-Stack Application
# This script provides copy-paste commands for manual testing

echo "🧪 Fault-Tolerant Full-Stack Application - Manual Testing Guide"
echo "================================================================="
echo ""
echo "Use these commands to manually test all application features:"
echo ""

echo "1️⃣  HEALTH CHECKS"
echo "==================="
echo ""
echo "# Check C++ service health:"
echo "curl http://localhost:8080/healthz"
echo ""
echo "# Check Function simulator health:"
echo "curl http://localhost:7071/function/health"  
echo ""
echo "# Check Frontend (should return HTML):"
echo "curl http://localhost:3000"
echo ""

echo "2️⃣  NORMAL PROCESSING"
echo "======================"
echo ""
echo "# Process text (will be reversed):"
echo 'curl -X POST http://localhost:7071/function/process \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"data\": \"Hello World\", \"idempotency_key\": \"test-123\"}"'
echo ""

echo "3️⃣  IDEMPOTENCY TESTING"
echo "========================"
echo ""
echo "# Send same request twice - should get identical responses:"
echo 'IDEM_KEY="idem-$(date +%s)"'
echo 'echo "Using idempotency key: $IDEM_KEY"'
echo ""
echo "# First request:"
echo 'curl -X POST http://localhost:7071/function/process \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"data\": \"Idempotency Test\", \"idempotency_key\": \"$IDEM_KEY\"}"'
echo ""
echo "# Second request (should return identical result):"
echo 'curl -X POST http://localhost:7071/function/process \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"data\": \"Idempotency Test\", \"idempotency_key\": \"$IDEM_KEY\"}"'
echo ""

echo "4️⃣  FAILURE SIMULATION"
echo "======================="
echo ""
echo "# Stop C++ service to test retry logic:"
echo "docker-compose stop cpp_service"
echo ""
echo "# Send request (will retry and eventually go to DLQ):"
echo 'curl -X POST http://localhost:7071/function/process \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"data\": \"This will fail\", \"idempotency_key\": \"fail-$(date +%s)\"}"'
echo ""
echo "# Check Dead Letter Queue:"
echo "curl http://localhost:7071/function/dlq"
echo ""
echo "# Restart C++ service:"
echo "docker-compose start cpp_service"
echo ""
echo "# Wait for service to be healthy:"
echo "sleep 10"
echo 'curl http://localhost:8080/healthz'
echo ""

echo "5️⃣  DLQ MANAGEMENT"
echo "=================="
echo ""
echo "# List DLQ messages:"
echo "curl http://localhost:7071/function/dlq"
echo ""
echo "# Replay a DLQ message (replace MESSAGE_ID):"
echo 'curl -X POST http://localhost:7071/function/dlq/replay \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"message_id\": \"MESSAGE_ID\"}"'
echo ""

echo "6️⃣  LOAD TESTING"
echo "================"
echo ""
echo "# Simple load test with curl:"
echo "for i in {1..10}; do"
echo '  curl -X POST http://localhost:7071/function/process \'
echo '    -H "Content-Type: application/json" \'
echo '    -d "{\"data\": \"Load test $i\", \"idempotency_key\": \"load-$i-$(date +%s)\"}" &'
echo "done"
echo "wait"
echo ""

echo "7️⃣  ERROR HANDLING"
echo "=================="
echo ""
echo "# Test invalid JSON:"
echo 'curl -X POST http://localhost:7071/function/process \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "invalid json"'
echo ""
echo "# Test missing data field:"
echo 'curl -X POST http://localhost:7071/function/process \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{\"idempotency_key\": \"missing-data\"}"'
echo ""

echo "8️⃣  REDIS OPERATIONS"
echo "===================="
echo ""
echo "# Connect to Redis and check stored keys:"
echo "docker-compose exec redis redis-cli"
echo ""
echo "# In Redis CLI:"
echo "# > KEYS *"
echo "# > GET idem:your-key-here"
echo "# > LRANGE dlq 0 -1"
echo "# > EXIT"
echo ""

echo "9️⃣  SERVICE LOGS"
echo "==============="
echo ""
echo "# View all service logs:"
echo "docker-compose logs"
echo ""
echo "# View specific service logs:"
echo "docker-compose logs cpp_service"
echo "docker-compose logs function_sim"
echo "docker-compose logs frontend"
echo "docker-compose logs redis"
echo ""
echo "# Follow logs in real-time:"
echo "docker-compose logs -f"
echo ""

echo "🔟 CLEANUP"
echo "=========="
echo ""
echo "# Stop all services:"
echo "docker-compose down"
echo ""
echo "# Stop and remove volumes (will delete Redis data):"
echo "docker-compose down -v"
echo ""
echo "# Remove built images:"
echo "docker-compose down --rmi all"
echo ""

echo "💡 PRO TIPS"
echo "==========="
echo ""
echo "# Start specific service:"
echo "docker-compose up cpp_service"
echo ""
echo "# Rebuild and start:"
echo "docker-compose up --build"
echo ""
echo "# Scale a service:"
echo "docker-compose up --scale function_sim=3"
echo ""
echo "# Run command in container:"
echo "docker-compose exec cpp_service /bin/bash"
echo ""
echo "# Check resource usage:"
echo "docker stats"
echo ""

echo "🎯 EXPECTED BEHAVIORS"
echo "====================="
echo ""
echo "✅ Normal request: Text should be reversed with timestamp"
echo "✅ Idempotency: Same key returns identical result"  
echo "✅ Failure: After 3 retries, request goes to DLQ"
echo "✅ Health: Services report their status"
echo "✅ Logs: Structured JSON logging"
echo ""
echo "📖 For automated testing, run:"
echo "   python tests/e2e_tests.py"
echo "   ./scripts/simulate_failure.sh"
echo ""
echo "🌐 Open http://localhost:3000 for web interface"
echo ""