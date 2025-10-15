const express = require('express');
const axios = require('axios');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 7071;

// Configuration
const config = {
    cppServiceUrl: process.env.CPP_SERVICE_URL || 'http://cpp_service:8080',
    redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS) || 100,
    maxDelayMs: parseInt(process.env.MAX_DELAY_MS) || 5000
};

// Redis client
let redisClient;

async function initRedis() {
    try {
        redisClient = redis.createClient({ url: config.redisUrl });
        redisClient.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });
        await redisClient.connect();
        console.log('Connected to Redis');
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
        redisClient = null;
    }
}

// Middleware
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    
    next();
});

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent') || 'unknown'
        };
        console.log(JSON.stringify(logEntry));
    });
    next();
});

// Utility functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateDelay(attempt, baseDelay, maxDelay) {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, maxDelay);
}

async function addToDLQ(message) {
    if (!redisClient) {
        console.error('Redis not available, cannot add to DLQ');
        return false;
    }
    
    try {
        const dlqEntry = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            originalMessage: message,
            attempts: config.maxRetries + 1
        };
        
        await redisClient.lPush('dlq', JSON.stringify(dlqEntry));
        console.log(`Added message to DLQ: ${dlqEntry.id}`);
        return true;
    } catch (error) {
        console.error('Failed to add message to DLQ:', error);
        return false;
    }
}

async function forwardRequestWithRetry(requestData) {
    let lastError;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt + 1}/${config.maxRetries + 1} to forward request`);
            
            const response = await axios.post(
                `${config.cppServiceUrl}/process`,
                requestData,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );
            
            console.log(`Request forwarded successfully on attempt ${attempt + 1}`);
            return { success: true, data: response.data };
            
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt + 1} failed:`, error.message);
            
            if (attempt < config.maxRetries) {
                const delay = calculateDelay(attempt, config.baseDelayMs, config.maxDelayMs);
                console.log(`Waiting ${delay}ms before retry...`);
                await sleep(delay);
            }
        }
    }
    
    // All retries failed, add to DLQ
    console.error(`All ${config.maxRetries + 1} attempts failed. Adding to DLQ.`);
    await addToDLQ(requestData);
    
    return {
        success: false,
        error: lastError,
        message: `Failed after ${config.maxRetries + 1} attempts`
    };
}

// Routes

// Health endpoint that checks C++ service
app.get('/function/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {}
    };
    
    try {
        // Check C++ service health
        const cppResponse = await axios.get(`${config.cppServiceUrl}/healthz`, { timeout: 3000 });
        health.services.cpp_service = {
            status: 'healthy',
            response_time: 'ok'
        };
    } catch (error) {
        health.services.cpp_service = {
            status: 'unhealthy',
            error: error.message
        };
        health.status = 'degraded';
    }
    
    // Check Redis connection
    if (redisClient && redisClient.isOpen) {
        try {
            await redisClient.ping();
            health.services.redis = { status: 'healthy' };
        } catch (error) {
            health.services.redis = { status: 'unhealthy', error: error.message };
            health.status = 'degraded';
        }
    } else {
        health.services.redis = { status: 'disconnected' };
        health.status = 'degraded';
    }
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
});

// Process endpoint with retry logic
app.post('/function/process', async (req, res) => {
    try {
        const { data, idempotency_key } = req.body;
        
        if (!data) {
            return res.status(400).json({
                error: 'Missing required field: data'
            });
        }
        
        const requestData = { data };
        if (idempotency_key) {
            requestData.idempotency_key = idempotency_key;
        }
        
        const result = await forwardRequestWithRetry(requestData);
        
        if (result.success) {
            res.json(result.data);
        } else {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: result.message,
                retry_after: Math.ceil(config.maxDelayMs / 1000) // seconds
            });
        }
        
    } catch (error) {
        console.error('Error in process endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// DLQ management endpoints
app.get('/function/dlq', async (req, res) => {
    if (!redisClient) {
        return res.status(503).json({ error: 'Redis not available' });
    }
    
    try {
        const messages = await redisClient.lRange('dlq', 0, -1);
        const parsedMessages = messages.map(msg => JSON.parse(msg));
        res.json({ dlq_messages: parsedMessages, count: parsedMessages.length });
    } catch (error) {
        console.error('Error retrieving DLQ:', error);
        res.status(500).json({ error: 'Failed to retrieve DLQ messages' });
    }
});

app.post('/function/dlq/replay', async (req, res) => {
    if (!redisClient) {
        return res.status(503).json({ error: 'Redis not available' });
    }
    
    try {
        const { message_id } = req.body;
        if (!message_id) {
            return res.status(400).json({ error: 'Missing message_id' });
        }
        
        // Get all DLQ messages
        const messages = await redisClient.lRange('dlq', 0, -1);
        const parsedMessages = messages.map(msg => JSON.parse(msg));
        
        // Find the specific message
        const messageToReplay = parsedMessages.find(msg => msg.id === message_id);
        if (!messageToReplay) {
            return res.status(404).json({ error: 'Message not found in DLQ' });
        }
        
        // Attempt to replay
        const result = await forwardRequestWithRetry(messageToReplay.originalMessage);
        
        if (result.success) {
            // Remove from DLQ if successful
            const messageIndex = parsedMessages.findIndex(msg => msg.id === message_id);
            if (messageIndex !== -1) {
                await redisClient.lRem('dlq', 1, JSON.stringify(messageToReplay));
            }
            
            res.json({
                success: true,
                message: 'Message replayed successfully',
                result: result.data
            });
        } else {
            res.status(503).json({
                success: false,
                message: 'Replay failed',
                error: result.message
            });
        }
        
    } catch (error) {
        console.error('Error replaying DLQ message:', error);
        res.status(500).json({ error: 'Failed to replay message' });
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');
    
    if (redisClient) {
        await redisClient.quit();
    }
    
    process.exit(0);
});

// Start server
async function startServer() {
    await initRedis();
    
    app.listen(port, '0.0.0.0', () => {
        console.log(`Node.js function simulator listening on port ${port}`);
        console.log(`C++ service URL: ${config.cppServiceUrl}`);
        console.log(`Max retries: ${config.maxRetries}`);
        console.log(`Base delay: ${config.baseDelayMs}ms`);
    });
}

if (require.main === module) {
    startServer().catch(console.error);
}

module.exports = { app, config, calculateDelay, addToDLQ, forwardRequestWithRetry };