import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import ProcessingForm from './components/ProcessingForm';
import HealthDashboard from './components/HealthDashboard';
import ResponseDisplay from './components/ResponseDisplay';
import './App.css';

const FUNCTION_URL = process.env.REACT_APP_FUNCTION_URL || 'http://localhost:7071';

function App() {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);

  const fetchHealthStatus = async () => {
    try {
      const response = await axios.get(`${FUNCTION_URL}/function/health`);
      setHealthStatus(response.data);
    } catch (error) {
      setHealthStatus({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    // Initial health check
    fetchHealthStatus();
    
    // Poll health status every 30 seconds
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (data, useIdempotencyKey) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const payload = { data };
      if (useIdempotencyKey) {
        payload.idempotency_key = uuidv4();
      }

      const result = await axios.post(`${FUNCTION_URL}/function/process`, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      setResponse({
        ...result.data,
        request: payload,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      let errorMessage = 'An unexpected error occurred';
      let errorDetails = {};

      if (error.response) {
        errorMessage = error.response.data?.error || `HTTP ${error.response.status}`;
        errorDetails = error.response.data || {};
      } else if (error.request) {
        errorMessage = 'Network error - service may be unavailable';
        errorDetails = { code: 'NETWORK_ERROR' };
      } else {
        errorMessage = error.message;
        errorDetails = { code: 'CLIENT_ERROR' };
      }

      setError({
        message: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🔧 Fault-Tolerant Full-Stack Application</h1>
        <p>Demonstrating microservices with retry logic, idempotency, and DLQ handling</p>
      </header>

      <main className="App-main">
        <div className="dashboard-container">
          <div className="dashboard-section">
            <HealthDashboard 
              healthStatus={healthStatus}
              onRefresh={fetchHealthStatus}
            />
          </div>

          <div className="form-section">
            <ProcessingForm 
              onSubmit={handleSubmit}
              loading={loading}
            />
          </div>

          <div className="response-section">
            <ResponseDisplay 
              response={response}
              error={error}
              loading={loading}
            />
          </div>
        </div>
      </main>

      <footer className="App-footer">
        <p>
          Architecture: React → Node.js Function → C++ Service → Redis
        </p>
        <p>
          <small>
            Features: Exponential backoff, Dead Letter Queue, Idempotency keys, Health monitoring
          </small>
        </p>
      </footer>
    </div>
  );
}

export default App;