import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time_custom');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete within 2s
    error_rate: ['rate<0.1'],          // Error rate must be less than 10%
    http_req_failed: ['rate<0.1'],     // Less than 10% of requests should fail
  },
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:7071';
const TEST_PHRASES = [
  'Hello World',
  'Load Testing with k6',
  'Fault Tolerant Architecture',
  'Microservices Testing',
  'Distributed Systems',
  'Redis Caching Layer',
  'Exponential Backoff',
  'Dead Letter Queue',
  'Circuit Breaker Pattern',
  'Health Check Monitoring'
];

// Generate unique idempotency key
function generateIdempotencyKey() {
  return `load-test-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
}

// Get random test phrase
function getRandomPhrase() {
  return TEST_PHRASES[Math.floor(Math.random() * TEST_PHRASES.length)];
}

export default function () {
  const testData = getRandomPhrase();
  const idempotencyKey = generateIdempotencyKey();
  
  const payload = JSON.stringify({
    data: testData,
    idempotency_key: idempotencyKey
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  // Send request to process endpoint
  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/function/process`, payload, params);
  const endTime = Date.now();
  
  const responseTimeMs = endTime - startTime;
  responseTime.add(responseTimeMs);

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has result': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result !== undefined;
      } catch {
        return false;
      }
    },
    'response time < 5s': () => responseTimeMs < 5000,
    'result is reversed': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result === testData.split('').reverse().join('');
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
    console.log(`Failed request: ${response.status} - ${response.body}`);
  }

  // Random sleep between 1-3 seconds
  sleep(Math.random() * 2 + 1);
}

// Setup function - runs once before all VUs
export function setup() {
  console.log('🚀 Starting load test...');
  console.log(`Target URL: ${BASE_URL}`);
  
  // Health check before starting load test
  const healthResponse = http.get(`${BASE_URL}/function/health`);
  if (healthResponse.status !== 200) {
    console.warn('⚠️ Health check failed, continuing with load test anyway');
  } else {
    console.log('✅ Initial health check passed');
  }
  
  return { baseUrl: BASE_URL };
}

// Teardown function - runs once after all VUs finish
export function teardown(data) {
  console.log('🏁 Load test completed');
  
  // Final health check
  const healthResponse = http.get(`${data.baseUrl}/function/health`);
  if (healthResponse.status === 200) {
    console.log('✅ Final health check passed');
  } else {
    console.log('❌ Final health check failed');
  }
  
  // Check DLQ status
  const dlqResponse = http.get(`${data.baseUrl}/function/dlq`);
  if (dlqResponse.status === 200) {
    try {
      const dlqData = JSON.parse(dlqResponse.body);
      console.log(`📊 DLQ contains ${dlqData.count} messages`);
    } catch {
      console.log('📊 DLQ status check failed');
    }
  }
}

// Test idempotency in parallel
export function testIdempotency() {
  const testData = 'Idempotency Test';
  const idempotencyKey = `idempotency-${Date.now()}`;
  
  const payload = JSON.stringify({
    data: testData,
    idempotency_key: idempotencyKey
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  };

  // Send same request twice simultaneously
  const responses = http.batch([
    ['POST', `${BASE_URL}/function/process`, payload, params],
    ['POST', `${BASE_URL}/function/process`, payload, params],
  ]);

  // Both requests should succeed and return identical results
  check(responses, {
    'both requests succeeded': (responses) => 
      responses[0].status === 200 && responses[1].status === 200,
    'responses are identical': (responses) => {
      try {
        const body1 = JSON.parse(responses[0].body);
        const body2 = JSON.parse(responses[1].body);
        return body1.result === body2.result && 
               body1.processed_at === body2.processed_at;
      } catch {
        return false;
      }
    },
  });
}

// Error injection test
export function testErrorHandling() {
  // Send malformed request
  const invalidPayload = '{"invalid": json}';
  const response = http.post(`${BASE_URL}/function/process`, invalidPayload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '5s',
  });

  check(response, {
    'handles invalid JSON gracefully': (r) => r.status === 400,
  });
}

// Alternative scenario for stress testing specific endpoints
export function healthCheckLoad() {
  const response = http.get(`${BASE_URL}/function/health`);
  
  check(response, {
    'health endpoint available': (r) => r.status === 200,
    'health response has status': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status !== undefined;
      } catch {
        return false;
      }
    },
  });
}

// Configuration for different test scenarios
export const scenarios = {
  // Main load test
  load_test: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 5 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 0 },
    ],
    exec: 'default',
  },
  
  // Health check monitoring
  health_monitoring: {
    executor: 'constant-vus',
    vus: 1,
    duration: '2m',
    exec: 'healthCheckLoad',
  },
  
  // Idempotency testing
  idempotency_test: {
    executor: 'per-vu-iterations',
    vus: 5,
    iterations: 2,
    exec: 'testIdempotency',
  },
  
  // Error handling test
  error_test: {
    executor: 'per-vu-iterations',
    vus: 2,
    iterations: 3,
    exec: 'testErrorHandling',
  },
};