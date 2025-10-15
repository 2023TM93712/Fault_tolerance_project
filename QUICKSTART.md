# Quick Start Guide

## Prerequisites
- Docker and Docker Compose
- Git (for cloning)

## Run Locally (5 minutes)

1. **Clone and start:**
```bash
git clone <repository-url>
cd fault-tolerant-fullstack
docker-compose up --build
```

2. **Verify services (wait ~2 minutes for all services to be ready):**
- Frontend: http://localhost:3000
- Health: http://localhost:7071/function/health

3. **Test the application:**
- Open http://localhost:3000
- Enter some text and click "Process Data"
- Check that the text is reversed with a timestamp

## Manual Testing Commands

**Test idempotency:**
```bash
# Same idempotency key should return identical results
curl -X POST http://localhost:7071/function/process \
  -H "Content-Type: application/json" \
  -d '{"data": "test", "idempotency_key": "unique-123"}'
```

**Test failure handling:**
```bash
# Stop C++ service to trigger retries and DLQ
docker-compose stop cpp_service

# Send request (will fail and go to DLQ)
curl -X POST http://localhost:7071/function/process \
  -H "Content-Type: application/json" \
  -d '{"data": "failure test", "idempotency_key": "fail-123"}'

# Check DLQ
curl http://localhost:7071/function/dlq

# Restart service
docker-compose start cpp_service
```

## Run Tests

**Unit tests:**
```bash
# C++ tests
cd service_cpp && mkdir build && cd build && cmake .. && make && ./tests/cpp_service_tests

# Node.js tests  
cd function_node && npm test

# React tests
cd frontend && npm test
```

**Integration tests:**
```bash
# Ensure services are running first
docker-compose up -d

# Run E2E tests
pip install -r tests/requirements.txt
python tests/e2e_tests.py
```

**Load tests:**
```bash
# Install k6: https://k6.io/docs/get-started/installation/
k6 run tests/load_test_k6.js
```

## Stop Services
```bash
docker-compose down
# or
./scripts/stop_local.sh  # (Linux/Mac)
```

## Architecture Overview
```
[Browser] → [React Frontend:3000] 
    ↓
[Node.js Function:7071] ← [Retry Logic + DLQ]
    ↓
[C++ Service:8080] ← [Idempotency via Redis:6379]
```

## Key Features Demonstrated
- ✅ Idempotency with Redis
- ✅ Exponential backoff retry
- ✅ Dead Letter Queue (DLQ)
- ✅ Health monitoring
- ✅ Graceful shutdown
- ✅ Unit + Integration tests
- ✅ CI/CD pipeline

For detailed instructions, see [README.md](README.md)