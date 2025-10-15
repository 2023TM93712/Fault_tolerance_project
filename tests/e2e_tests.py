#!/usr/bin/env python3
"""
End-to-End Integration Tests for Fault-Tolerant Full-Stack Application

This script tests the complete application workflow including:
- Service health checks
- Normal request processing
- Idempotency behavior
- Retry logic and DLQ functionality
- Failure scenarios
"""

import requests
import time
import json
import uuid
import subprocess
import sys
import docker
from typing import Dict, Any, Optional
import pytest


class E2ETestRunner:
    def __init__(self, base_url: str = "http://localhost"):
        self.base_url = base_url
        self.cpp_service_url = f"{base_url}:8080"
        self.function_url = f"{base_url}:7071"
        self.frontend_url = f"{base_url}:3000"
        self.docker_client = docker.from_env()
        
    def wait_for_services(self, timeout: int = 60) -> bool:
        """Wait for all services to be healthy."""
        print("⏳ Waiting for services to be ready...")
        
        services = [
            ("C++ Service", f"{self.cpp_service_url}/healthz"),
            ("Function Simulator", f"{self.function_url}/function/health"),
            ("Frontend", f"{self.frontend_url}")
        ]
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            all_healthy = True
            for service_name, url in services:
                try:
                    response = requests.get(url, timeout=5)
                    if response.status_code != 200:
                        all_healthy = False
                        break
                except requests.RequestException:
                    all_healthy = False
                    break
            
            if all_healthy:
                print("✅ All services are ready!")
                return True
            
            print(f"⏳ Services not ready yet... ({int(time.time() - start_time)}s)")
            time.sleep(5)
        
        print("❌ Services failed to become ready within timeout")
        return False
    
    def get_container_by_name(self, name_pattern: str):
        """Get Docker container by name pattern."""
        containers = self.docker_client.containers.list()
        for container in containers:
            if name_pattern in container.name:
                return container
        return None
    
    def stop_service(self, service_name: str) -> bool:
        """Stop a Docker service."""
        try:
            result = subprocess.run(
                ["docker-compose", "stop", service_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        except subprocess.TimeoutExpired:
            return False
    
    def start_service(self, service_name: str) -> bool:
        """Start a Docker service."""
        try:
            result = subprocess.run(
                ["docker-compose", "start", service_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        except subprocess.TimeoutExpired:
            return False


class TestHealthChecks:
    def __init__(self, runner: E2ETestRunner):
        self.runner = runner
    
    def test_cpp_service_health(self):
        """Test C++ service health endpoint."""
        print("🧪 Testing C++ service health...")
        response = requests.get(f"{self.runner.cpp_service_url}/healthz", timeout=10)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
        print("✅ C++ service health check passed")
    
    def test_function_health(self):
        """Test function simulator health endpoint."""
        print("🧪 Testing function simulator health...")
        response = requests.get(f"{self.runner.function_url}/function/health", timeout=10)
        
        assert response.status_code in [200, 503]  # 503 is acceptable if backend is down
        data = response.json()
        assert "status" in data
        assert "services" in data
        print("✅ Function simulator health check passed")
    
    def test_frontend_availability(self):
        """Test frontend availability."""
        print("🧪 Testing frontend availability...")
        response = requests.get(self.runner.frontend_url, timeout=10)
        
        assert response.status_code == 200
        assert "Fault-Tolerant" in response.text
        print("✅ Frontend availability test passed")


class TestNormalOperation:
    def __init__(self, runner: E2ETestRunner):
        self.runner = runner
    
    def test_process_request(self):
        """Test normal request processing."""
        print("🧪 Testing normal request processing...")
        
        test_data = "Hello, World!"
        idempotency_key = str(uuid.uuid4())
        
        payload = {
            "data": test_data,
            "idempotency_key": idempotency_key
        }
        
        response = requests.post(
            f"{self.runner.function_url}/function/process",
            json=payload,
            timeout=15
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert "processed_at" in data
        assert data["result"] == test_data[::-1]  # Should be reversed
        print("✅ Normal request processing test passed")
        
        return data
    
    def test_request_validation(self):
        """Test request validation."""
        print("🧪 Testing request validation...")
        
        # Test missing data field
        response = requests.post(
            f"{self.runner.function_url}/function/process",
            json={},
            timeout=10
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        print("✅ Request validation test passed")


class TestIdempotency:
    def __init__(self, runner: E2ETestRunner):
        self.runner = runner
    
    def test_idempotency_behavior(self):
        """Test idempotency behavior."""
        print("🧪 Testing idempotency behavior...")
        
        test_data = "Idempotency Test"
        idempotency_key = str(uuid.uuid4())
        
        payload = {
            "data": test_data,
            "idempotency_key": idempotency_key
        }
        
        # First request
        response1 = requests.post(
            f"{self.runner.function_url}/function/process",
            json=payload,
            timeout=15
        )
        
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Second request with same idempotency key
        response2 = requests.post(
            f"{self.runner.function_url}/function/process",
            json=payload,
            timeout=15
        )
        
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Results should be identical
        assert data1["result"] == data2["result"]
        assert data1["processed_at"] == data2["processed_at"]
        print("✅ Idempotency behavior test passed")


class TestFailureScenarios:
    def __init__(self, runner: E2ETestRunner):
        self.runner = runner
    
    def test_cpp_service_failure(self):
        """Test behavior when C++ service is down."""
        print("🧪 Testing C++ service failure scenario...")
        
        # Stop C++ service
        print("🛑 Stopping C++ service...")
        success = self.runner.stop_service("cpp_service")
        assert success, "Failed to stop C++ service"
        
        time.sleep(5)  # Wait for service to be down
        
        try:
            # Send request that should fail
            test_data = "Failure Test"
            idempotency_key = str(uuid.uuid4())
            
            payload = {
                "data": test_data,
                "idempotency_key": idempotency_key
            }
            
            response = requests.post(
                f"{self.runner.function_url}/function/process",
                json=payload,
                timeout=30  # Longer timeout to account for retries
            )
            
            # Should return 503 after retries
            assert response.status_code == 503
            data = response.json()
            assert "error" in data
            assert "retry_after" in data
            print("✅ Service failure handling test passed")
            
            # Check DLQ
            dlq_response = requests.get(f"{self.runner.function_url}/function/dlq", timeout=10)
            assert dlq_response.status_code == 200
            dlq_data = dlq_response.json()
            assert "dlq_messages" in dlq_data
            assert dlq_data["count"] > 0
            print("✅ DLQ message creation test passed")
            
        finally:
            # Restart C++ service
            print("🔄 Restarting C++ service...")
            success = self.runner.start_service("cpp_service")
            assert success, "Failed to restart C++ service"
            
            # Wait for service to be healthy
            time.sleep(10)
            health_response = requests.get(f"{self.runner.cpp_service_url}/healthz", timeout=10)
            assert health_response.status_code == 200
            print("✅ C++ service restarted successfully")
    
    def test_concurrent_requests(self):
        """Test system behavior under concurrent load."""
        print("🧪 Testing concurrent request handling...")
        
        import concurrent.futures
        import threading
        
        def send_request(index: int) -> dict:
            payload = {
                "data": f"Concurrent test {index}",
                "idempotency_key": str(uuid.uuid4())
            }
            
            response = requests.post(
                f"{self.runner.function_url}/function/process",
                json=payload,
                timeout=20
            )
            
            return {
                "index": index,
                "status_code": response.status_code,
                "success": response.status_code == 200
            }
        
        # Send 10 concurrent requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(send_request, i) for i in range(10)]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        # Check results
        successful_requests = sum(1 for r in results if r["success"])
        assert successful_requests >= 8, f"Only {successful_requests}/10 requests succeeded"
        print(f"✅ Concurrent request test passed ({successful_requests}/10 successful)")


def run_e2e_tests():
    """Run all end-to-end tests."""
    print("🚀 Starting End-to-End Integration Tests")
    print("=" * 50)
    
    runner = E2ETestRunner()
    
    # Wait for services to be ready
    if not runner.wait_for_services():
        print("❌ Services are not ready. Make sure docker-compose is running.")
        sys.exit(1)
    
    # Run test suites
    test_suites = [
        ("Health Checks", TestHealthChecks(runner)),
        ("Normal Operation", TestNormalOperation(runner)),
        ("Idempotency", TestIdempotency(runner)),
        ("Failure Scenarios", TestFailureScenarios(runner))
    ]
    
    total_tests = 0
    passed_tests = 0
    
    for suite_name, test_suite in test_suites:
        print(f"\n📋 Running {suite_name} Tests")
        print("-" * 40)
        
        # Get all test methods
        test_methods = [method for method in dir(test_suite) if method.startswith('test_')]
        
        for test_method_name in test_methods:
            total_tests += 1
            try:
                test_method = getattr(test_suite, test_method_name)
                test_method()
                passed_tests += 1
            except Exception as e:
                print(f"❌ {test_method_name} failed: {str(e)}")
    
    # Print summary
    print("\n" + "=" * 50)
    print(f"🏁 Test Summary: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"❌ {total_tests - passed_tests} tests failed")
        return 1


if __name__ == "__main__":
    exit_code = run_e2e_tests()
    sys.exit(exit_code)