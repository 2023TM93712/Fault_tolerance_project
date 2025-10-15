import React, { useState } from 'react';

function ProcessingForm({ onSubmit, loading }) {
  const [data, setData] = useState('');
  const [useIdempotencyKey, setUseIdempotencyKey] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (data.trim()) {
      onSubmit(data.trim(), useIdempotencyKey);
    }
  };

  return (
    <div className="card processing-form">
      <h2>🚀 Process Data</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="data-input">
            Data to Process:
          </label>
          <textarea
            id="data-input"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="Enter text to be processed (will be reversed)..."
            disabled={loading}
            required
          />
        </div>
        
        <div className="form-group">
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="idempotency-checkbox"
              checked={useIdempotencyKey}
              onChange={(e) => setUseIdempotencyKey(e.target.checked)}
              disabled={loading}
            />
            <label htmlFor="idempotency-checkbox">
              Use idempotency key (prevents duplicate processing)
            </label>
          </div>
        </div>
        
        <button 
          type="submit" 
          className="submit-button"
          disabled={loading || !data.trim()}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Process Data'
          )}
        </button>
      </form>
      
      <div style={{ marginTop: '15px', fontSize: '0.9rem', color: '#666' }}>
        <strong>How it works:</strong>
        <ul style={{ textAlign: 'left', marginTop: '5px' }}>
          <li>Your data is sent to the Node.js function</li>
          <li>Function forwards to C++ microservice with retry logic</li>
          <li>C++ service reverses the text and adds timestamp</li>
          <li>Failed requests go to Dead Letter Queue after max retries</li>
        </ul>
      </div>
    </div>
  );
}

export default ProcessingForm;