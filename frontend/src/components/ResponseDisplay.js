import React from 'react';

function ResponseDisplay({ response, error, loading }) {
  const formatJson = (obj) => {
    return JSON.stringify(obj, null, 2);
  };

  if (loading) {
    return (
      <div className="card response-display">
        <h2>📤 Response</h2>
        <div className="response-loading">
          <div className="loading-spinner"></div>
          Processing your request...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card response-display">
        <h2>❌ Error Response</h2>
        <div className="response-error">
          <strong>Error:</strong> {error.message}
          <div className="timestamp">
            {error.timestamp && `Occurred at: ${new Date(error.timestamp).toLocaleString()}`}
          </div>
        </div>
        
        {error.details && Object.keys(error.details).length > 0 && (
          <>
            <h4>Error Details:</h4>
            <div className="json-display">
              {formatJson(error.details)}
            </div>
          </>
        )}
      </div>
    );
  }

  if (response) {
    return (
      <div className="card response-display">
        <h2>✅ Success Response</h2>
        <div className="response-success">
          <strong>Status:</strong> Successfully processed!
          <div className="timestamp">
            {response.timestamp && `Received at: ${new Date(response.timestamp).toLocaleString()}`}
          </div>
        </div>
        
        <h4>Processed Result:</h4>
        <div className="json-display">
          <strong>Original:</strong> "{response.request?.data}"<br/>
          <strong>Processed:</strong> "{response.result}"<br/>
          <strong>Processed At:</strong> {response.processed_at}
          {response.request?.idempotency_key && (
            <>
              <br/><strong>Idempotency Key:</strong> {response.request.idempotency_key}
            </>
          )}
        </div>
        
        <h4>Full Response:</h4>
        <div className="json-display">
          {formatJson(response)}
        </div>
      </div>
    );
  }

  return (
    <div className="card response-display">
      <h2>📤 Response</h2>
      <div style={{ 
        padding: '40px', 
        textAlign: 'center', 
        color: '#999',
        fontStyle: 'italic'
      }}>
        Submit a request above to see the response here...
      </div>
    </div>
  );
}

export default ResponseDisplay;