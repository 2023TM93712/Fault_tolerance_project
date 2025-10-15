# Quick Start Guide - Fault-Tolerant Application

## 🚀 5-Minute Setup

### Prerequisites Checklist
- [ ] Docker Desktop installed and running
- [ ] 4GB+ RAM available
- [ ] Ports 3000, 6379, 7071, 8080 available

### Run Commands
```bash
# 1. Start the application
docker-compose up --build

# 2. Wait 2-3 minutes for all services to start

# 3. Access the application
# Web Interface: http://localhost:3000
# API Health: http://localhost:7071/function/health
```

## 🎯 What This Application Does

### Business Purpose
**Demonstrates enterprise-grade fault tolerance patterns** for building resilient distributed systems that can handle failures gracefully.

### Core Functionality
1. **Text Processing**: Reverses input text with timestamps
2. **Health Monitoring**: Real-time service health dashboard
3. **Fault Tolerance**: Automatic retry, circuit breaker, idempotency
4. **Microservices**: Multi-language, containerized architecture

## 🏢 Business Value

### Target Use Cases
- **Payment Processing**: Prevent duplicate transactions
- **E-commerce Orders**: Handle service outages gracefully
- **IoT Data Processing**: Manage device connectivity issues
- **API Gateways**: Route requests with fault tolerance
- **Financial Systems**: Ensure data consistency

### Key Benefits
- **99.9% Uptime**: High availability design
- **Zero Data Loss**: Idempotency prevents duplicates
- **Auto Recovery**: Self-healing capabilities
- **Cost Reduction**: Less manual intervention needed

## 🔧 Architecture Overview

```
Frontend (React) → Function Simulator (Node.js) → C++ Service
       ↓                      ↓
   Port 3000            Redis Cache (Port 6379)
                        Port 7071
```

## 🧪 Quick Test Commands

```bash
# Test health check
curl http://localhost:7071/function/health

# Test data processing
curl -X POST -H "Content-Type: application/json" \
  -d '{"data":"Hello World","idempotency_key":"test-123"}' \
  http://localhost:7071/function/process

# Test idempotency (run twice - should get same result)
curl -X POST -H "Content-Type: application/json" \
  -d '{"data":"Test","idempotency_key":"duplicate-test"}' \
  http://localhost:7071/function/process
```

## 🛡️ Fault Tolerance Features

1. **Circuit Breaker**: Prevents cascading failures
2. **Retry Logic**: Exponential backoff for transient issues
3. **Idempotency**: Exactly-once processing guarantee
4. **Health Checks**: Continuous monitoring
5. **Dead Letter Queue**: Failed message handling

## 🔍 Monitoring URLs

- **Web Dashboard**: http://localhost:3000
- **API Health**: http://localhost:7071/function/health
- **Service Logs**: `docker-compose logs -f`

## 📊 Success Metrics

- **Response Time**: < 100ms average
- **Availability**: 99.9% uptime target
- **Error Recovery**: Automatic within 30 seconds
- **Zero Duplicates**: Idempotency guarantee

## 🚨 Troubleshooting

### Common Issues
- **Port conflicts**: Check if ports are already in use
- **Docker memory**: Increase Docker Desktop memory limit
- **Build failures**: Run `docker system prune -a` and rebuild

### Quick Fixes
```bash
# Restart services
docker-compose restart

# View logs
docker-compose logs [service-name]

# Clean restart
docker-compose down && docker-compose up --build
```

---
For detailed documentation, see `APPLICATION_DOCUMENTATION.md`