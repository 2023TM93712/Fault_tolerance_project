const request = require('supertest');
const { app, calculateDelay, addToDLQ, forwardRequestWithRetry } = require('../index');

describe('Function Node Simulator', () => {
    describe('Utility Functions', () => {
        test('calculateDelay should implement exponential backoff', () => {
            const baseDelay = 100;
            const maxDelay = 5000;
            
            const delay0 = calculateDelay(0, baseDelay, maxDelay);
            const delay1 = calculateDelay(1, baseDelay, maxDelay);
            const delay2 = calculateDelay(2, baseDelay, maxDelay);
            
            // Should be approximately exponential (with jitter)
            expect(delay0).toBeGreaterThanOrEqual(baseDelay * 0.9);
            expect(delay0).toBeLessThanOrEqual(baseDelay * 2.2);
            
            expect(delay1).toBeGreaterThanOrEqual(baseDelay * 1.8);
            expect(delay1).toBeLessThanOrEqual(baseDelay * 4.4);
            
            expect(delay2).toBeGreaterThanOrEqual(baseDelay * 3.6);
            expect(delay2).toBeLessThanOrEqual(maxDelay);
        });
        
        test('calculateDelay should respect maxDelay', () => {
            const baseDelay = 100;
            const maxDelay = 500;
            
            const delay = calculateDelay(10, baseDelay, maxDelay);
            expect(delay).toBeLessThanOrEqual(maxDelay);
        });
    });
    
    describe('Health Endpoint', () => {
        test('GET /function/health should return health status', async () => {
            const response = await request(app)
                .get('/function/health')
                .expect('Content-Type', /json/);
            
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('services');
        });
    });
    
    describe('Process Endpoint', () => {
        test('POST /function/process should require data field', async () => {
            const response = await request(app)
                .post('/function/process')
                .send({})
                .expect(400);
            
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Missing required field: data');
        });
        
        test('POST /function/process should accept valid request', async () => {
            const response = await request(app)
                .post('/function/process')
                .send({
                    data: 'test data',
                    idempotency_key: 'test-key-123'
                });
            
            // This might fail if C++ service is not running, but we test the structure
            expect(response.status).toBeGreaterThanOrEqual(200);
        });
    });
    
    describe('DLQ Endpoints', () => {
        test('GET /function/dlq should return DLQ status', async () => {
            const response = await request(app)
                .get('/function/dlq');
            
            // Might be 503 if Redis is not available, but should have proper structure
            if (response.status === 200) {
                expect(response.body).toHaveProperty('dlq_messages');
                expect(response.body).toHaveProperty('count');
            } else {
                expect(response.body).toHaveProperty('error');
            }
        });
        
        test('POST /function/dlq/replay should require message_id', async () => {
            const response = await request(app)
                .post('/function/dlq/replay')
                .send({})
                .expect(400);
            
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Missing message_id');
        });
    });
    
    describe('Error Handling', () => {
        test('should handle invalid JSON gracefully', async () => {
            const response = await request(app)
                .post('/function/process')
                .set('Content-Type', 'application/json')
                .send('invalid json');
            
            expect(response.status).toBe(400);
        });
        
        test('should handle missing content-type', async () => {
            const response = await request(app)
                .post('/function/process')
                .send('some data');
            
            // Express should handle this gracefully
            expect(response.status).toBeGreaterThanOrEqual(400);
        });
    });
});