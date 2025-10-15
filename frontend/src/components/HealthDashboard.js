import React from 'react';

function HealthDashboard({ healthStatus, onRefresh }) {
  const getStatusClass = (status) => {
    switch (status) {
      case 'ok': return 'status-ok';
      case 'degraded': return 'status-degraded';
      default: return 'status-error';
    }
  };

  const getServiceStatusClass = (status) => {
    switch (status) {
      case 'healthy': return 'service-healthy';
      case 'unhealthy': return 'service-unhealthy';
      case 'disconnected': return 'service-disconnected';
      default: return 'service-unhealthy';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="card health-dashboard">
      <h2>
        📊 System Health
        <button 
          className="refresh-button" 
          onClick={onRefresh}
          style={{ float: 'right' }}
        >
          🔄 Refresh
        </button>
      </h2>
      
      {healthStatus ? (
        <>
          <div className="health-status">
            <div className={`status-indicator ${getStatusClass(healthStatus.status)}`}></div>
            <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
              {healthStatus.status || 'Unknown'}
            </span>
            {healthStatus.error && (
              <span style={{ color: '#f44336', marginLeft: '10px' }}>
                ({healthStatus.error})
              </span>
            )}
          </div>
          
          <div className="timestamp">
            Last checked: {formatTimestamp(healthStatus.timestamp)}
          </div>
          
          {healthStatus.services && (
            <div className="services-list">
              <h4 style={{ marginBottom: '10px', color: '#555' }}>Services:</h4>
              {Object.entries(healthStatus.services).map(([serviceName, serviceData]) => (
                <div key={serviceName} className="service-item">
                  <span className="service-name">
                    {serviceName.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className={`service-status ${getServiceStatusClass(serviceData.status)}`}>
                    {serviceData.status}
                    {serviceData.error && ` (${serviceData.error})`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          <div className="loading-spinner"></div>
          Loading health status...
        </div>
      )}
    </div>
  );
}

export default HealthDashboard;