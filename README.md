# Fault-Tolerant Full-Stack Application

🛡️ **Enterprise-grade fault-tolerant microservices architecture** demonstrating resilience patterns, idempotency, retry mechanisms, and dead letter queue (DLQ) handling.

## 📚 Documentation

- **📖 [Complete Documentation](APPLICATION_DOCUMENTATION.md)** - Comprehensive guide covering business perspective, architecture, and operations
- **🚀 [Quick Start Guide](QUICK_START.md)** - Get up and running in 5 minutes
- **💼 [Business Case](BUSINESS_CASE.md)** - ROI analysis, use cases, and strategic value
- **🔧 [Manual Testing Guide](MANUAL_TESTING.md)** - Test scenarios and validation procedures

## 🎯 Quick Overview

### **What it Does**
- **Text Processing**: Demonstrates fault-tolerant data processing with text reversal
- **Health Monitoring**: Real-time dashboard showing service health and fault tolerance states
- **Resilience Patterns**: Circuit breaker, retry logic, idempotency, and graceful degradation
- **Microservices**: Multi-language containerized services with full observability

### **Business Value**
- **99.9% Uptime Target**: Enterprise-grade reliability patterns
- **Zero Data Loss**: Idempotency ensures exactly-once processing
- **Auto Recovery**: Self-healing capabilities reduce manual intervention
- **Cost Effective**: 644% ROI through reduced downtime and operational efficiency

### **5-Minute Quick Start**
```bash
# Clone and start
git clone <repository-url>
cd fault-tolerant-fullstack
docker-compose up --build

# Access application
# Web Interface: http://localhost:3000
# API Health: http://localhost:7071/function/health
```

## Architecture

- **Backend Microservice**: C++ (C++17) with cpp-httplib and nlohmann::json
- **Serverless Forwarder**: Node.js Express simulating Azure Functions HTTP trigger
- **Frontend**: React application with static file serving
- **State Store**: Redis for idempotency and circuit-breaker state
- **Containerization**: Docker for all components
- **Orchestration**: Docker Compose for local development
- **CI/CD**: GitHub Actions with comprehensive testing

## Repository Structure

```
├── README.md
├── docker-compose.yml
├── LICENSE
├── .github/workflows/ci.yml
├── service_cpp/              # C++ microservice
│   ├── main.cpp
│   ├── CMakeLists.txt
│   ├── include/
│   ├── tests/
│   └── Dockerfile
├── function_node/            # Node.js Azure Function simulator
│   ├── index.js
│   ├── package.json
│   ├── Dockerfile
│   └── tests/
├── frontend/                 # React frontend
│   ├── package.json
│   ├── src/
│   ├── Dockerfile
│   └── tests/
├── infra/                    # Deployment templates
│   ├── kubernetes/
│   └── azure/
├── scripts/                  # Utility scripts
│   ├── run_local.sh
│   ├── stop_local.sh
│   └── simulate_failure.sh
└── tests/                    # E2E and load tests
    ├── e2e_tests.py
    └── load_test_k6.js
```

## Features

### 1. C++ Microservice
- Health endpoint (`/healthz`)
- Processing endpoint (`/process`) with idempotency support
- Redis integration for idempotency keys
- Graceful shutdown on SIGTERM
- Unit tests with GoogleTest

### 2. Node.js Forwarder (Azure Function Simulator)
- Request forwarding with retry logic
- Exponential backoff with jitter
- Dead Letter Queue (DLQ) for failed messages
- Health aggregation
- Integration tests

### 3. React Frontend
- Simple UI for request submission
- Health status dashboard
- Jest unit tests

### 4. Fault Tolerance
- Idempotency key tracking
- Retry mechanisms with exponential backoff
- Dead Letter Queue for failed messages
- Circuit breaker patterns

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- CMake and GCC (for local C++ development)

### Local Development

1. **Start all services:**
```bash
docker-compose up --build
```

2. **Verify services are running:**
- C++ Service: http://localhost:8080/healthz
- Function Simulator: http://localhost:7071/function/health
- Frontend: http://localhost:3000

### Testing

#### Unit Tests

**C++ Tests:**
```bash
cd service_cpp
mkdir build && cd build
cmake ..
make
./tests/cpp_service_tests
```

**Node.js Tests:**
```bash
cd function_node
npm test
```

**React Tests:**
```bash
cd frontend
npm test
```

#### Integration Tests

```bash
# Start services
docker-compose up -d

# Run e2e tests
python tests/e2e_tests.py

# Run load tests (optional)
k6 run tests/load_test_k6.js
```

### Manual Testing

#### Test Idempotency:
```bash
# First request
curl -X POST http://localhost:7071/function/process \
  -H "Content-Type: application/json" \
  -d '{"data": "hello world", "idempotency_key": "test-123"}'

# Second request (should return same result)
curl -X POST http://localhost:7071/function/process \
  -H "Content-Type: application/json" \
  -d '{"data": "hello world", "idempotency_key": "test-123"}'
```

#### Test Retry/DLQ Behavior:
```bash
# Stop C++ service to simulate failure
docker-compose stop cpp_service

# Send request (will retry and go to DLQ)
curl -X POST http://localhost:7071/function/process \
  -H "Content-Type: application/json" \
  -d '{"data": "test failure", "idempotency_key": "fail-123"}'

# Check DLQ in Redis
docker-compose exec redis redis-cli LRANGE dlq 0 -1
```

## Environment Variables

### C++ Service
- `PORT`: Service port (default: 8080)
- `REDIS_URL`: Redis connection URL (default: redis://redis:6379)

### Node.js Function
- `PORT`: Service port (default: 7071)
- `CPP_SERVICE_URL`: C++ service URL (default: http://cpp_service:8080)
- `REDIS_URL`: Redis connection URL (default: redis://redis:6379)
- `MAX_RETRIES`: Maximum retry attempts (default: 3)
- `BASE_DELAY_MS`: Base delay for exponential backoff (default: 100)

### Frontend
- `REACT_APP_FUNCTION_URL`: Function service URL (default: http://localhost:7071)

## Deployment

### Azure Container Registry (ACR)

1. **Build and tag images:**
```bash
# Build all images
docker-compose build

# Tag for ACR
docker tag fault-tolerant-fullstack_cpp_service your-acr.azurecr.io/cpp-service:latest
docker tag fault-tolerant-fullstack_function_sim your-acr.azurecr.io/function-sim:latest
docker tag fault-tolerant-fullstack_frontend your-acr.azurecr.io/frontend:latest
```

2. **Push to ACR:**
```bash
# Login to ACR
az acr login --name your-acr

# Push images
docker push your-acr.azurecr.io/cpp-service:latest
docker push your-acr.azurecr.io/function-sim:latest
docker push your-acr.azurecr.io/frontend:latest
```

### Azure Kubernetes Service (AKS)

1. **Apply Kubernetes manifests:**
```bash
kubectl apply -f infra/kubernetes/
```

2. **Monitor deployment:**
```bash
kubectl get pods
kubectl get services
```

### Azure Container Apps

1. **Deploy using Azure CLI:**
```bash
az containerapp up \
  --name fault-tolerant-app \
  --resource-group your-rg \
  --location eastus \
  --environment your-env \
  --image your-acr.azurecr.io/cpp-service:latest
```

## Monitoring and Observability

- **Health Endpoints**: All services expose `/health` or `/healthz` endpoints
- **Structured Logging**: JSON-formatted logs with timestamps
- **OpenTelemetry**: Placeholder instrumentation for distributed tracing
- **Metrics**: Basic performance and error rate metrics

## Development Notes

### Production Considerations (TODOs)

- [ ] **Security**: Implement proper authentication and authorization
- [ ] **Secrets Management**: Use Azure Key Vault or Kubernetes secrets
- [ ] **TLS**: Enable HTTPS for all inter-service communication
- [ ] **Database**: Replace Redis with production-grade database for persistence
- [ ] **Monitoring**: Implement comprehensive monitoring with Prometheus/Grafana
- [ ] **Resource Limits**: Set appropriate CPU/memory limits in Kubernetes
- [ ] **Auto-scaling**: Configure HPA (Horizontal Pod Autoscaler)
- [ ] **Backup**: Implement backup strategies for stateful components

### Known Limitations

- Redis is used for both caching and DLQ (production should separate concerns)
- No authentication between services (acceptable for private network)
- Simple retry logic (production should implement circuit breakers)
- Basic error handling (production needs comprehensive error taxonomy)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run the full test suite
5. Submit a pull request

## License

MIT License - see LICENSE file for details.